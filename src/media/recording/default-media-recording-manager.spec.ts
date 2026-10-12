import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment, type BrowserGlobals } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import type { ScreenWakeLock } from '../../screen/wake-lock/screen-wake-lock.ts'
import { WakeLockHold } from '../../screen/wake-lock/wake-lock-hold.ts'
import type { CameraSession } from '../camera/session/camera-session.ts'
import type { CombinedMediaSession } from '../combined/combined-media-session.ts'
import { MediaError } from '../errors/media-error.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { MicrophoneSession } from '../microphone/session/microphone-session.ts'
import type { PageLifecycle, PageLifecycleEvents, PageState } from '../../platform/page/page-lifecycle.ts'
import { DefaultMediaRecordingManager } from './default-media-recording-manager.ts'
import type { MediaRecordingState, RecordingProgress, RecordingSource } from './media-recording.ts'
import { FakeMediaRecorder } from './testing/fake-media-recorder.ts'
import { FakeRecordingSource } from './testing/fake-recording-source.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

/** a page that can go to the background and be left */
class FakePage extends EventEmitter<PageLifecycleEvents> implements PageLifecycle {
  public state: PageState = 'visible'
  public readonly isVisible = true

  public whenVisible(): Promise<void> {
    return Promise.resolve()
  }

  public change(state: PageState): void {
    this.state = state
    this.emit('change', state)
  }

  public leave(): void {
    this.emit('leave', { isKept: false })
  }

  public get watchers(): number {
    return this.listenerCount('change') + this.listenerCount('leave')
  }

  public dispose(): void {
    this.removeAllListeners()
  }

  public [Symbol.dispose](): void {
    this.dispose()
  }
}

/** what a stream that is written into received */
class FakeSink {
  public readonly written: string[] = []
  public isClosed = false
  public abortReason: unknown
  public isAborted = false
  /** makes the next writes fail */
  public failure: unknown

  public readonly stream = new WritableStream<Uint8Array>({
    write: (chunk) => {
      if (this.failure !== undefined) {
        throw this.failure
      }

      this.written.push(new TextDecoder().decode(chunk))
    },
    close: () => {
      this.isClosed = true
    },
    abort: (reason) => {
      this.isAborted = true
      this.abortReason = reason
    },
  })
}

describe('default-media-recording-manager', () => {
  let source!: FakeRecordingSource
  let wakeLock!: ScreenWakeLock
  let page!: FakePage
  let logger!: Logger
  let sut!: DefaultMediaRecordingManager

  const globals = (): Partial<BrowserGlobals> => ({
    MediaRecorder: FakeMediaRecorder as unknown as BrowserGlobals['MediaRecorder'],
    Blob,
  })

  const managerOf = (browser: Partial<BrowserGlobals>) =>
    new DefaultMediaRecordingManager(BrowserEnvironment.of(browser), wakeLock, page, logger)

  beforeEach(() => {
    FakeMediaRecorder.reset()
    source = new FakeRecordingSource()
    wakeLock = mock<ScreenWakeLock>({ isSupported: false })
    page = new FakePage()
    logger = mock<Logger>()
    sut = managerOf(globals())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('should accept every kind of session as what is recorded', async () => {
    // compiles only if the sessions of the library are sources of a recording
    const sources = (camera: CameraSession, microphone: MicrophoneSession, both: CombinedMediaSession) =>
      [camera, microphone, both] satisfies RecordingSource[]

    expect(sources).toBeDefined()
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      expect(DefaultMediaRecordingManager.create().isSupported).toBe(false)
    })
  })

  describe('#isSupported', () => {
    test('should tell whether the browser can record', async () => {
      expect(sut.isSupported).toBe(true)
      expect(managerOf({}).isSupported).toBe(false)
    })
  })

  describe('#formats', () => {
    test('should list the common formats the browser can write, best first', async () => {
      FakeMediaRecorder.supported = ['video/webm', 'video/webm;codecs=vp8', 'video/mp4', 'audio/webm']

      expect(sut.formats('video')).toEqual(['video/mp4', 'video/webm'])
      expect(sut.formats('audio')).toEqual(['audio/webm'])
    })

    test('should choose from the formats it is given', async () => {
      expect(sut.formats('audio', ['audio/wav', 'audio/webm'])).toEqual(['audio/webm'])
      expect(sut.canRecord('audio/wav')).toBe(false)
    })

    test('should list nothing where the browser cannot be asked', async () => {
      const unknown = managerOf({ MediaRecorder: class {} as unknown as BrowserGlobals['MediaRecorder'] })

      expect(unknown.formats('video')).toEqual([])
      expect(managerOf({}).canRecord('video/webm')).toBe(false)
    })
  })

  describe('#record', () => {
    test('should record the stream of the session in the best format the browser can write', async () => {
      const recording = await sut.record(source)

      expect(FakeMediaRecorder.last.stream).toBe(source.stream)
      expect(FakeMediaRecorder.last.state).toBe('recording')
      expect(FakeMediaRecorder.last.timeslice).toBe(1000)
      expect(recording.mimeType).toBe('video/webm')
      expect(recording.state).toBe('recording')
    })

    test('should choose a format for sound where there is no picture', async () => {
      const recording = await sut.record(new FakeRecordingSource('audio'))

      expect(recording.mimeType).toBe('audio/webm')
    })

    test('should take the first format of the application the browser can write', async () => {
      const recording = await sut.record(source, { format: ['video/mp4', 'video/webm'] })

      expect(recording.mimeType).toBe('video/webm')
      expect(FakeMediaRecorder.last.options.mimeType).toBe('video/webm')
    })

    test('should refuse formats the browser cannot write', async () => {
      await expect(sut.record(source, { format: 'video/mp4' })).rejects.toThrow(UnsupportedError)
      expect(FakeMediaRecorder.instances).toHaveLength(0)
      expect(source.allowTakeover).toBe(true)
    })

    test('should report what the browser says it writes, which can name more than it was asked for', async () => {
      FakeMediaRecorder.details = ';codecs=vp9'

      const recording = await sut.record(source)
      FakeMediaRecorder.last.deliver('data')
      const result = await recording.stop()

      expect(FakeMediaRecorder.last.options.mimeType).toBe('video/webm')
      expect(recording.mimeType).toBe('video/webm;codecs=vp9')
      expect(result.mimeType).toBe('video/webm;codecs=vp9')
      expect(result.blob?.type).toBe('video/webm;codecs=vp9')
    })

    test('should leave the format to a browser that cannot be asked', async () => {
      FakeMediaRecorder.supported = []
      FakeMediaRecorder.defaultFormat = 'video/x-matroska'

      const recording = await sut.record(source)

      expect(FakeMediaRecorder.last.options.mimeType).toBeUndefined()
      expect(recording.mimeType).toBe('video/x-matroska')
    })

    test('should hand the settings of the application to the recorder', async () => {
      await sut.record(source, { audioBitsPerSecond: 64_000, videoBitsPerSecond: 2_000_000, interval: 250 })

      expect(FakeMediaRecorder.last.options).toMatchObject({
        audioBitsPerSecond: 64_000,
        videoBitsPerSecond: 2_000_000,
      })
      expect(FakeMediaRecorder.last.timeslice).toBe(250)
    })

    test('should say where the browser cannot record', async () => {
      await expect(managerOf({}).record(source)).rejects.toThrow(UnsupportedError)
    })

    test('should refuse a session that has ended', async () => {
      source.end()

      await expect(sut.record(source)).rejects.toThrow(SessionClosedError)
    })

    test('should report a recording the browser does not start', async () => {
      FakeMediaRecorder.startError = new Error('not supported')

      const failure = await sut.record(source).catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(MediaError)
      expect(failure).toHaveProperty('cause', FakeMediaRecorder.startError)
      expect(source.allowTakeover).toBe(true)
    })
  })

  describe('a recording', () => {
    test('should keep what was recorded in memory until it is stopped', async () => {
      const recording = await sut.record(source)
      FakeMediaRecorder.last.deliver('one ')
      FakeMediaRecorder.last.deliver('two ')

      const result = await recording.stop()

      expect(await result.blob?.text()).toBe('one two end')
      expect(result.blob?.type).toBe('video/webm')
      expect(result.bytes).toBe(11)
      expect(result.mimeType).toBe('video/webm')
      expect(result.segments).toHaveLength(1)
      expect(result.segments[0]).toMatchObject({ index: 0, mimeType: 'video/webm', bytes: 11 })
      expect(recording.state).toBe('stopped')
      expect(FakeMediaRecorder.last.state).toBe('inactive')
    })

    test('should return the same result however often it is stopped', async () => {
      const recording = await sut.record(source)

      const result = await recording.stop()

      expect(await recording.stop()).toBe(result)
      expect(await recording.finished).toBe(result)
    })

    test('should stop when it is declared with await using', async () => {
      {
        await using recording = await sut.record(source)
        expect(recording.state).toBe('recording')
      }

      expect(FakeMediaRecorder.last.state).toBe('inactive')
    })

    test('should announce its states and what was handed over', async () => {
      const states: MediaRecordingState[] = []
      const progress: RecordingProgress[] = []
      const recording = await sut.record(source)
      recording.on('statechange', (state) => states.push(state))
      recording.on('progress', (made) => progress.push(made))

      FakeMediaRecorder.last.deliver('1234')
      recording.pause()
      recording.resume()
      await recording.stop()

      expect(states).toEqual(['paused', 'recording', 'stopped'])
      expect(progress.map(({ bytes, segments }) => [bytes, segments])).toEqual([
        [4, 1],
        [7, 1],
      ])
    })

    test('should not count the time it was paused', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
      const recording = await sut.record(source)

      now.mockReturnValue(3000)
      recording.pause()
      expect(FakeMediaRecorder.last.state).toBe('paused')

      now.mockReturnValue(10_000)
      expect(recording.duration).toBe(2000)
      recording.resume()
      expect(FakeMediaRecorder.last.state).toBe('recording')

      now.mockReturnValue(11_000)
      FakeMediaRecorder.last.deliver('data')
      const result = await recording.stop()

      expect(result.duration).toBe(3000)
      expect(result.segments[0]?.duration).toBe(3000)
    })

    test('should keep other tabs from taking the device until it is over', async () => {
      const recording = await sut.record(source)
      expect(source.allowTakeover).toBe(false)

      await recording.stop()
      expect(source.allowTakeover).toBe(true)
    })

    test('should leave the device to other tabs when it is asked to', async () => {
      await sut.record(source, { holdDevice: false })

      expect(source.allowTakeover).toBe(true)
    })

    test('should end and keep what was recorded when the session ends', async () => {
      const recording = await sut.record(source)
      FakeMediaRecorder.last.deliver('kept ')

      source.end()
      const result = await recording.finished

      expect(await result.blob?.text()).toBe('kept end')
      expect(recording.state).toBe('stopped')
    })

    test('should end when the session ends after the browser stopped the recorder', async () => {
      const recording = await sut.record(source)
      FakeMediaRecorder.last.deliver('kept ')

      source.suspend()
      FakeMediaRecorder.last.interrupt()
      await flush()
      source.end()

      expect((await recording.finished).segments).toHaveLength(1)
    })
  })

  describe('a device that is started again', () => {
    test('should continue in a new segment with the new stream', async () => {
      const recording = await sut.record(source)
      const [first] = FakeMediaRecorder.instances
      first?.deliver('first ')

      source.suspend()
      first?.interrupt()
      await flush()
      expect(FakeMediaRecorder.instances).toHaveLength(1)

      source.deliver()
      await flush()
      expect(FakeMediaRecorder.instances).toHaveLength(2)
      expect(FakeMediaRecorder.last.stream).toBe(source.stream)
      FakeMediaRecorder.last.deliver('second ')

      const result = await recording.stop()

      expect(result.segments.map(({ index }) => index)).toEqual([0, 1])
      expect(await result.segments[0]?.blob?.text()).toBe('first end')
      expect(await result.segments[1]?.blob?.text()).toBe('second end')
      expect(result.blob).toBeUndefined()
      expect(result.bytes).toBe(19)
    })

    test('should continue at once with a session that still delivers', async () => {
      await sut.record(source)

      FakeMediaRecorder.last.interrupt()
      await flush()

      expect(FakeMediaRecorder.instances).toHaveLength(2)
      expect(FakeMediaRecorder.last.state).toBe('recording')
    })

    test('should end the file of a recorder that keeps recording the old stream', async () => {
      const recording = await sut.record(source)
      const [first] = FakeMediaRecorder.instances

      source.suspend()
      source.deliver()
      await flush()

      expect(first?.state).toBe('inactive')
      expect(FakeMediaRecorder.instances).toHaveLength(2)
      expect((await recording.stop()).segments).toHaveLength(2)
    })

    test('should stay paused in the new segment', async () => {
      const recording = await sut.record(source)
      recording.pause()

      source.suspend()
      FakeMediaRecorder.last.interrupt()
      source.deliver()
      await flush()

      expect(FakeMediaRecorder.last.state).toBe('paused')
      expect(recording.state).toBe('paused')
    })

    test('should end between two segments when it is stopped there', async () => {
      const recording = await sut.record(source)
      FakeMediaRecorder.last.deliver('first ')
      source.suspend()
      FakeMediaRecorder.last.interrupt()
      await flush()

      const result = await recording.stop()

      expect(result.segments).toHaveLength(1)
      expect(FakeMediaRecorder.instances).toHaveLength(1)
    })

    test('should fail if the browser does not start the next segment', async () => {
      const recording = await sut.record(source)
      FakeMediaRecorder.startError = new Error('not again')

      FakeMediaRecorder.last.interrupt()

      await expect(recording.finished).rejects.toThrow(MediaError)
      expect(recording.state).toBe('stopped')
    })
  })

  describe('a recording that is written somewhere else', () => {
    test('should write every piece into the stream of its segment and close it', async () => {
      const sink = new FakeSink()
      const into = vi.fn(async () => sink.stream)
      const recording = await sut.record(source, { into })
      FakeMediaRecorder.last.deliver('one ')
      FakeMediaRecorder.last.deliver('two ')

      const result = await recording.stop()

      expect(into).toHaveBeenCalledExactlyOnceWith(0)
      expect(sink.written).toEqual(['one ', 'two ', 'end'])
      expect(sink.isClosed).toBe(true)
      expect(result.segments[0]).toMatchObject({ index: 0, bytes: 11 })
      expect(result.segments[0]?.blob).toBeUndefined()
      expect(result.blob).toBeUndefined()
    })

    test('should ask for a stream per segment', async () => {
      const sinks = [new FakeSink(), new FakeSink()]
      const recording = await sut.record(source, { into: async (segment) => sinks[segment]?.stream ?? sinks[0].stream })
      FakeMediaRecorder.last.deliver('first ')

      FakeMediaRecorder.last.interrupt()
      await flush()
      FakeMediaRecorder.last.deliver('second ')
      await recording.stop()

      expect(sinks.map(({ written }) => written.join(''))).toEqual(['first end', 'second end'])
      expect(sinks.every(({ isClosed }) => isClosed)).toBe(true)
    })

    test('should fail and keep nothing of a segment that cannot be written', async () => {
      const sink = new FakeSink()
      const recording = await sut.record(source, { into: async () => sink.stream })
      sink.failure = new Error('disk full')

      FakeMediaRecorder.last.deliver('lost')
      const failure = await recording.finished.catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(MediaError)
      expect(failure).toHaveProperty('cause', sink.failure)
      expect(sink.isClosed).toBe(false)
      expect(FakeMediaRecorder.last.state).toBe('inactive')
      expect(recording.state).toBe('stopped')
      expect(source.allowTakeover).toBe(true)
    })

    test('should not start to record without a stream to write into', async () => {
      const refusal = new Error('no space')

      await expect(sut.record(source, { into: () => Promise.reject(refusal) })).rejects.toBe(refusal)
      expect(FakeMediaRecorder.instances).toHaveLength(0)
    })
  })

  describe('a page that goes away', () => {
    test('should have the browser hand over what was recorded when the page is hidden or frozen', async () => {
      const sink = new FakeSink()
      const recording = await sut.record(source, { into: async () => sink.stream })

      page.change('hidden')
      page.change('frozen')
      page.change('visible')
      await flush()

      expect(sink.written).toEqual(['flushed ', 'flushed '])
      expect(recording.state).toBe('recording')
    })

    test('should not ask a paused recorder for data', async () => {
      const recording = await sut.record(source)
      recording.pause()

      page.change('hidden')

      expect(recording.bytes).toBe(0)
    })

    test('should end and keep the recording when the page is left', async () => {
      const recording = await sut.record(source)
      FakeMediaRecorder.last.deliver('kept ')

      page.leave()
      const result = await recording.finished

      expect(await result.blob?.text()).toBe('kept end')
    })

    test('should go on when the page is left if it is asked to', async () => {
      const recording = await sut.record(source, { stopOnLeave: false })

      page.leave()
      await flush()

      expect(recording.state).toBe('recording')
    })

    test('should stop watching the page when it is over', async () => {
      const recording = await sut.record(source)
      expect(page.watchers).toBe(2)

      await recording.stop()

      expect(page.watchers).toBe(0)
    })
  })

  describe('#discard', () => {
    test('should drop what is being recorded', async () => {
      const recording = await sut.record(source)
      FakeMediaRecorder.last.deliver('dropped')

      await recording.discard()

      expect((await recording.finished).segments).toEqual([])
      expect(recording.state).toBe('stopped')
    })

    test('should abort the stream that is written into', async () => {
      const sink = new FakeSink()
      const recording = await sut.record(source, { into: async () => sink.stream })
      FakeMediaRecorder.last.deliver('dropped')

      await recording.discard()

      expect(sink.isAborted).toBe(true)
      expect(sink.isClosed).toBe(false)
    })
  })

  describe('keeping the screen on', () => {
    test('should keep the screen on until the recording is over', async () => {
      const hold = new WakeLockHold(() => undefined)
      wakeLock = mock<ScreenWakeLock>({ isSupported: true, request: vi.fn(async () => hold) })
      sut = managerOf(globals())

      const recording = await sut.record(source, { keepAwake: true })
      expect(hold.isReleased).toBe(false)

      await recording.stop()
      expect(hold.isReleased).toBe(true)
    })

    test('should not ask for it unless the application does', async () => {
      wakeLock = mock<ScreenWakeLock>({ isSupported: true })
      sut = managerOf(globals())

      await sut.record(source)

      expect(wakeLock.request).not.toHaveBeenCalled()
    })

    test('should record all the same where the screen cannot be kept on', async () => {
      wakeLock = mock<ScreenWakeLock>({ isSupported: true, request: vi.fn(() => Promise.reject(new Error('no'))) })
      sut = new DefaultMediaRecordingManager(BrowserEnvironment.of(globals()), wakeLock, page, new NullLogger())

      const recording = await sut.record(source, { keepAwake: true })

      expect(recording.state).toBe('recording')
    })
  })
})
