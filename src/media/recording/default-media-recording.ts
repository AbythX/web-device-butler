import '../../core/disposable-polyfill.ts'

import type { BrowserEnvironment, MediaRecorderFactory } from '../../core/environment/browser-environment.ts'
import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import type { PageLifecycle } from '../../platform/page/page-lifecycle.ts'
import type { WakeLockHold } from '../../screen/wake-lock/wake-lock-hold.ts'
import { MediaError } from '../errors/media-error.ts'
import type {
  MediaRecording,
  MediaRecordingEvents,
  MediaRecordingState,
  RecordedSegment,
  RecordingOptions,
  RecordingResult,
  RecordingSource,
} from './media-recording.ts'
import { WebmDuration } from './webm/webm-duration.ts'

/**
 * The file that is being written.
 */
interface OpenSegment {
  readonly index: number
  readonly recorder: MediaRecorder
  /** what was recorded, unless it is written somewhere else */
  readonly chunks: Blob[]
  readonly writer: WritableStreamDefaultWriter<Uint8Array> | undefined
  /** the pieces are written one after another, in the order the recorder delivered them; never rejects */
  writing: Promise<void>
  bytes: number
  /** the length of the recording when the segment began */
  readonly startedAt: number
}

/**
 * The implementation of {@link MediaRecording}.
 */
export class DefaultMediaRecording extends EventEmitter<MediaRecordingEvents> implements MediaRecording {
  private static readonly defaultInterval = 1000

  public readonly finished: Promise<RecordingResult>

  private settle: { resolve(result: RecordingResult): void; reject(error: unknown): void } | undefined
  private currentState: MediaRecordingState = 'recording'
  /** what the browser says it writes, which can name more than what it was asked for, such as the codecs */
  private writtenFormat: string
  private segment: OpenSegment | undefined
  private readonly closed: RecordedSegment[] = []
  private opened = 0
  private isStopRequested = false
  private isDiscarded = false
  private isConcluded = false
  private failure: unknown
  /** how long was recorded before the clock was started the last time */
  private recordedBefore = 0
  private runningSince: number | undefined
  /** what the recording does to its recorder happens one step after another */
  private work: Promise<void> = Promise.resolve()
  private readonly subscriptions: EventSubscription[]
  private readonly allowedTakeover: boolean

  /**
   * @param format the format to write; `undefined` leaves the choice to the browser
   * @param hold keeps the screen on; released when the recording is over
   * @param page tells when the page goes to the background or is left
   */
  public constructor(
    private readonly source: RecordingSource,
    private readonly MediaRecorder: MediaRecorderFactory,
    private readonly format: string | undefined,
    private readonly options: RecordingOptions,
    private readonly environment: BrowserEnvironment,
    private readonly hold: WakeLockHold | undefined,
    page: PageLifecycle,
    private readonly logger: Logger
  ) {
    super()

    this.writtenFormat = format ?? ''
    this.allowedTakeover = source.allowTakeover

    this.finished = new Promise((resolve, reject) => {
      this.settle = { resolve, reject }
    })
    // a recording nobody waits for must not fail the page
    this.finished.catch(() => undefined)

    if (options.holdDevice !== false) {
      source.allowTakeover = false
    }

    this.subscriptions = [
      source.on('statechange', (state) => {
        if (state === 'live') {
          this.enqueue(() => this.follow())
        }
      }),
      // the device went away, or the application closed the session: what was recorded is kept
      source.on('ended', () => this.requestStop()),
      // a page in the background may never run again: what was recorded so far is handed over now
      page.on('change', (state) => {
        if (state !== 'visible') {
          this.flush()
        }
      }),
      page.on('leave', () => {
        if (options.stopOnLeave !== false) {
          this.requestStop()
        }
      }),
    ]
  }

  /**
   * Begins the first segment.
   *
   * @throws MediaError if the browser does not start the recording, which is over then
   */
  public async start(): Promise<void> {
    try {
      await this.open()
    } catch (error) {
      this.failure = error
      this.conclude()
      throw error
    }
  }

  public get state(): MediaRecordingState {
    return this.currentState
  }

  public get mimeType(): string {
    return this.writtenFormat
  }

  public get duration(): number {
    return this.recordedBefore + (this.runningSince === undefined ? 0 : Date.now() - this.runningSince)
  }

  public get bytes(): number {
    return this.closed.reduce((bytes, segment) => bytes + segment.bytes, this.segment?.bytes ?? 0)
  }

  public pause(): void {
    if (this.currentState !== 'recording') {
      return
    }

    if (this.segment?.recorder.state === 'recording') {
      this.segment.recorder.pause()
    }

    this.stopClock()
    this.changeState('paused')
  }

  public resume(): void {
    if (this.currentState !== 'paused') {
      return
    }

    if (this.segment?.recorder.state === 'paused') {
      this.segment.recorder.resume()
    }

    if (this.segment !== undefined) {
      this.startClock()
    }

    this.changeState('recording')
  }

  public stop(): Promise<RecordingResult> {
    this.requestStop()

    return this.finished
  }

  public async discard(): Promise<void> {
    this.isDiscarded = true
    this.requestStop()

    await this.finished.catch(() => undefined)
  }

  /**
   * Calls {@link stop}, so the object can be declared with `await using`.
   */
  public async [Symbol.asyncDispose](): Promise<void> {
    await this.stop()
  }

  private flush(): void {
    const recorder = this.segment?.recorder

    if (recorder?.state === 'recording') {
      try {
        recorder.requestData()
      } catch (error) {
        this.logger.debug('The recorder of the browser did not hand over its data', error)
      }
    }
  }

  private enqueue(step: () => void | Promise<void>): void {
    this.work = this.work.then(step).catch((error: unknown) => {
      this.failure ??= error
      this.conclude()
    })
  }

  private requestStop(): void {
    if (this.isStopRequested) {
      return
    }

    this.isStopRequested = true

    this.enqueue(() => {
      const recorder = this.segment?.recorder

      if (recorder === undefined) {
        // between two segments, while the device is started again
        this.conclude()
      } else if (recorder.state !== 'inactive') {
        // the recorder hands over its last piece and reports that it stopped, which closes the segment
        recorder.stop()
      }
    })
  }

  /**
   * The session delivers again. After its device was started again or replaced, that is another stream or another
   * track than the one that is recorded, and the recording continues in a new segment.
   */
  private async follow(): Promise<void> {
    if (this.isConcluded || this.isStopRequested) {
      return
    }

    const recorder = this.segment?.recorder

    if (recorder === undefined) {
      await this.open()
    } else if (recorder.stream !== this.source.stream && recorder.state !== 'inactive') {
      // a browser that keeps recording a stream that delivers nothing more is told to end the file
      recorder.stop()
    }
  }

  private async open(): Promise<void> {
    const index = this.opened++
    const writer = this.options.into === undefined ? undefined : (await this.options.into(index)).getWriter()
    let recorder: MediaRecorder

    try {
      recorder = new this.MediaRecorder(this.source.stream, {
        mimeType: this.format,
        audioBitsPerSecond: this.options.audioBitsPerSecond,
        videoBitsPerSecond: this.options.videoBitsPerSecond,
      })
      recorder.start(this.options.interval ?? DefaultMediaRecording.defaultInterval)
    } catch (error) {
      await writer?.abort(error).catch(() => undefined)
      throw new MediaError('The browser did not start the recording', { cause: error })
    }

    const segment: OpenSegment = {
      index,
      recorder,
      chunks: [],
      writer,
      writing: Promise.resolve(),
      bytes: 0,
      startedAt: this.duration,
    }

    recorder.addEventListener('dataavailable', ({ data }) => this.accept(segment, data))
    recorder.addEventListener('stop', () => this.enqueue(() => this.close(segment)))
    recorder.addEventListener('error', (event) =>
      this.logger.warn('The recorder of the browser reported an error', event)
    )

    this.segment = segment
    this.noteFormat(recorder)

    if (this.currentState === 'paused') {
      recorder.pause()
    } else {
      this.startClock()
    }
  }

  private accept(segment: OpenSegment, data: Blob): void {
    if (data.size === 0 || this.isConcluded) {
      return
    }

    const { writer } = segment
    segment.bytes += data.size
    this.noteFormat(segment.recorder)

    if (writer === undefined) {
      segment.chunks.push(data)
    } else {
      segment.writing = segment.writing
        .then(async () => writer.write(new Uint8Array(await data.arrayBuffer())))
        .catch((error: unknown) => this.fail(error))
    }

    this.emitSafely(
      'progress',
      { duration: this.duration, bytes: this.bytes, segments: this.closed.length + 1 },
      this.logger
    )
  }

  /**
   * What was written cannot be written any further: the recording ends, and nothing is kept of the open segment.
   */
  private fail(error: unknown): void {
    if (this.failure !== undefined) {
      return
    }

    this.failure = error
    this.requestStop()
  }

  /**
   * The recorder of the segment has stopped, because the recording was stopped or because the browser ended the
   * file: its device was started again or replaced.
   */
  private async close(segment: OpenSegment): Promise<void> {
    if (this.segment !== segment) {
      return
    }

    this.segment = undefined
    this.stopClock()
    await segment.writing

    if (this.failure !== undefined || this.isDiscarded) {
      await segment.writer?.abort(this.failure).catch(() => undefined)
    } else {
      await this.keep(segment)
    }

    if (this.isStopRequested || this.failure !== undefined || this.source.state === 'ended') {
      this.conclude()
    } else if (this.source.state === 'live') {
      await this.open()
    }
    // otherwise the next segment begins when the session delivers again
  }

  private async keep(segment: OpenSegment): Promise<void> {
    const { index, recorder, chunks, writer, bytes, startedAt } = segment
    this.noteFormat(recorder)
    const mimeType = this.writtenFormat

    try {
      await writer?.close()
    } catch (error) {
      this.failure = error

      return
    }

    // a segment without data is one the browser ended before it began
    if (bytes > 0) {
      const duration = this.duration - startedAt

      this.closed.push({
        index,
        mimeType,
        bytes,
        duration,
        blob: writer === undefined ? await this.fileOf(chunks, mimeType, duration) : undefined,
      })
    }
  }

  /**
   * The pieces of a segment as one file. A recorder cannot write the length into a WebM file, which leaves players
   * unable to show it or to jump to a position, so it is written into it here.
   */
  private async fileOf(chunks: Blob[], mimeType: string, duration: number): Promise<Blob> {
    const file = this.environment.createBlob(chunks, mimeType)

    if (!/^(audio|video)\/webm/i.test(mimeType)) {
      return file
    }

    try {
      return await WebmDuration.apply(file, duration, (parts, type) => this.environment.createBlob(parts, type))
    } catch (error) {
      this.logger.debug('Could not write the length into the recording', error)

      return file
    }
  }

  private conclude(): void {
    if (this.isConcluded) {
      return
    }

    this.isConcluded = true
    this.stopClock()
    this.subscriptions.forEach((subscription) => subscription.unsubscribe())
    this.hold?.release()

    if (this.options.holdDevice !== false) {
      this.source.allowTakeover = this.allowedTakeover
    }

    this.changeState('stopped')
    this.removeAllListeners()

    if (this.failure === undefined) {
      this.settle?.resolve(this.result)
    } else {
      this.settle?.reject(
        this.failure instanceof DeviceButlerError
          ? this.failure
          : new MediaError('The recording could not be written', { cause: this.failure })
      )
    }
  }

  private get result(): RecordingResult {
    const segments = [...this.closed]

    return {
      mimeType: this.writtenFormat,
      duration: this.duration,
      bytes: this.bytes,
      segments,
      blob: segments.length === 1 ? segments[0]?.blob : undefined,
    }
  }

  /**
   * Some browsers only say what they write once the recorder runs.
   */
  private noteFormat(recorder: MediaRecorder): void {
    if (recorder.mimeType.length > 0) {
      this.writtenFormat = recorder.mimeType
    }
  }

  private startClock(): void {
    this.runningSince ??= Date.now()
  }

  private stopClock(): void {
    this.recordedBefore = this.duration
    this.runningSince = undefined
  }

  private changeState(state: MediaRecordingState): void {
    if (state !== this.currentState && this.currentState !== 'stopped') {
      this.currentState = state
      this.emitSafely('statechange', state, this.logger)
    }
  }
}
