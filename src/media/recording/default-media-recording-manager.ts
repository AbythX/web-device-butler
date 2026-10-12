import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { ScopedLogger } from '../../core/logging/scoped-logger.ts'
import { DefaultPageLifecycle } from '../../platform/page/default-page-lifecycle.ts'
import type { PageLifecycle } from '../../platform/page/page-lifecycle.ts'
import { DefaultScreenWakeLock } from '../../screen/wake-lock/default-screen-wake-lock.ts'
import type { ScreenWakeLock } from '../../screen/wake-lock/screen-wake-lock.ts'
import type { WakeLockHold } from '../../screen/wake-lock/wake-lock-hold.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import { DefaultMediaRecording } from './default-media-recording.ts'
import type { MediaRecording, RecordingOptions, RecordingSource } from './media-recording.ts'
import type { MediaRecordingManager } from './media-recording-manager.ts'

/**
 * The implementation of {@link MediaRecordingManager}.
 */
export class DefaultMediaRecordingManager implements MediaRecordingManager {
  /**
   * MP4 first: more players read it, and the browsers that cannot write it say so. The formats name no codecs: a
   * browser that is told to write sound into a recording of a camera alone can wait for that sound forever, and
   * each browser knows best which of its codecs fits.
   */
  private static readonly commonFormats: Record<'audio' | 'video', readonly string[]> = {
    video: ['video/mp4', 'video/webm'],
    audio: ['audio/mp4', 'audio/webm', 'audio/ogg'],
  }

  /**
   * For applications that only use the recorder. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): MediaRecordingManager {
    return new DefaultMediaRecordingManager(
      environment,
      new DefaultScreenWakeLock(environment, logger),
      new DefaultPageLifecycle(environment, logger),
      logger
    )
  }

  /**
   * @param wakeLock keeps the screen on for the recordings that ask for it
   * @param page tells the recordings when the page goes to the background or is left
   */
  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly wakeLock: ScreenWakeLock,
    private readonly page: PageLifecycle,
    private readonly logger: Logger
  ) {}

  public get isSupported(): boolean {
    return this.environment.MediaRecorder !== undefined
  }

  public formats(
    kind: 'audio' | 'video',
    candidates: readonly string[] = DefaultMediaRecordingManager.commonFormats[kind]
  ): string[] {
    return candidates.filter((format) => this.canRecord(format))
  }

  public canRecord(format: string): boolean {
    const MediaRecorder = this.environment.MediaRecorder

    return MediaRecorder !== undefined && typeof MediaRecorder.isTypeSupported === 'function'
      ? MediaRecorder.isTypeSupported(format)
      : false
  }

  public async record(source: RecordingSource, options: RecordingOptions = {}): Promise<MediaRecording> {
    const MediaRecorder = this.environment.MediaRecorder

    if (MediaRecorder === undefined) {
      throw new UnsupportedError('MediaRecorder')
    }

    if (source.state === 'ended') {
      throw new SessionClosedError()
    }

    const format = this.formatFor(source, options)
    const hold = options.keepAwake ? await this.keepAwake() : undefined

    const recording = new DefaultMediaRecording(
      source,
      MediaRecorder,
      format,
      options,
      this.environment,
      hold,
      this.page,
      new ScopedLogger('MediaRecording', this.logger)
    )

    await recording.start()

    return recording
  }

  /**
   * @returns `undefined` where the browser cannot be asked what it writes; it chooses itself then
   * @throws UnsupportedError if the browser can write none of the formats the application asked for
   */
  private formatFor(source: RecordingSource, { format }: RecordingOptions): string | undefined {
    const kind = source.stream.getVideoTracks().length > 0 ? 'video' : 'audio'

    if (format === undefined) {
      return this.formats(kind)[0]
    }

    const wanted = typeof format === 'string' ? [format] : format
    const [supported] = this.formats(kind, wanted)

    if (supported === undefined) {
      throw new UnsupportedError(`MediaRecorder (${wanted.join(', ')})`)
    }

    return supported
  }

  /**
   * A screen that cannot be kept on is no reason not to record.
   */
  private async keepAwake(): Promise<WakeLockHold | undefined> {
    if (!this.wakeLock.isSupported) {
      return undefined
    }

    try {
      return await this.wakeLock.request()
    } catch (error) {
      this.logger.info('Could not keep the screen on for the recording', error)

      return undefined
    }
  }
}
