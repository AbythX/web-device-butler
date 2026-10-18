import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import type { BrowserGlobals } from '../../core/environment/browser-environment.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { DefaultPageLifecycle } from '../../platform/page/default-page-lifecycle.ts'
import { DefaultScreenWakeLock } from '../../screen/wake-lock/default-screen-wake-lock.ts'
import type { CameraManager } from '../camera/camera-manager.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { MicrophoneManager } from '../microphone/microphone-manager.ts'
import type { MicrophoneSession } from '../microphone/session/microphone-session.ts'
import { MicrophoneTestBench } from '../microphone/testing/microphone-test-bench.ts'
import { DefaultMediaRecordingManager } from '../recording/default-media-recording-manager.ts'
import { FakeMediaRecorder } from '../recording/testing/fake-media-recorder.ts'
import { DefaultScreenCaptureManager } from '../screen-capture/default-screen-capture-manager.ts'
import type { ScreenCaptureSession } from '../screen-capture/session/screen-capture-session.ts'
import type { MediaSessionState } from '../session/media-session.ts'
import { FakeAudioContext } from '../testing/fake-audio-context.ts'
import { FakeMediaBrowser } from '../testing/fake-media-browser.ts'
import type { FakeMediaStreamTrack } from '../testing/fake-media-stream-track.ts'
import { DefaultMediaManager } from './default-media-manager.ts'
import type { JoinedMediaSource, JoinedMediaSourceEnd } from './joined-media-source.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

const fake = (track: MediaStreamTrack) => track as unknown as FakeMediaStreamTrack

describe('default-joined-media-source', () => {
  let browser!: FakeMediaBrowser
  let microphones!: MicrophoneManager
  let screens!: DefaultScreenCaptureManager
  let screen!: ScreenCaptureSession
  let microphone!: MicrophoneSession
  let media!: DefaultMediaManager

  let sut!: JoinedMediaSource
  let ends!: JoinedMediaSourceEnd[]
  let states!: MediaSessionState[]

  beforeEach(async () => {
    FakeAudioContext.reset()
    FakeMediaRecorder.reset()
    browser = new FakeMediaBrowser(
      { inputs: MicrophoneTestBench.computer() },
      {
        MediaRecorder: FakeMediaRecorder as unknown as BrowserGlobals['MediaRecorder'],
        Blob,
      }
    )
    browser.devices.displayChoice = { surface: 'window' }

    const environment = browser.openEnvironment()
    microphones = MicrophoneTestBench.load(browser, { autoRecover: true })
    screens = new DefaultScreenCaptureManager({}, environment, new NullLogger())
    media = new DefaultMediaManager(mock<CameraManager>(), microphones, environment, new NullLogger())

    screen = await screens.open()
    microphone = await microphones.open()

    sut = media.join(screen, microphone)
    ends = []
    states = []
    sut.on('ended', (end) => ends.push(end))
    sut.on('statechange', (state) => states.push(state))
  })

  afterEach(async () => {
    sut.dispose()
    await Promise.all([screen.close(), microphone.close()])
    await screens.dispose()
    await microphones.dispose()
    await flush()

    browser.close()
    browser.devices.assertNothingRuns()
    browser.devices.assertNoViolations()
  })

  test('should put the tracks of every session into one stream', () => {
    expect(sut.stream.getTracks()).toEqual([screen.track, microphone.track])
    expect(sut.sources).toEqual([screen, microphone])
    expect(sut.state).toBe('live')
  })

  test('should keep the stream when a session continues with a new track', async () => {
    const stream = sut.stream
    const previous = microphone.track

    fake(previous).end()
    await waitFor(() => microphone.track !== previous && microphone.state === 'live')

    expect(sut.stream).toBe(stream)
    expect(sut.stream.getTracks()).toEqual([screen.track, microphone.track])
    expect(ends).toEqual([])
  })

  test('should be muted while one of the sessions delivers nothing', () => {
    fake(microphone.track).mute()
    fake(microphone.track).unmute()

    expect(states).toEqual(['muted', 'live'])
  })

  test('should end with the first session that ends, and leave the others running', async () => {
    fake(screen.track).end()
    await waitFor(() => ends.length > 0)

    expect(ends).toEqual([{ reason: 'device', source: screen }])
    expect(sut.state).toBe('ended')
    expect(microphone.state).toBe('live')
  })

  test('should end with closed when it is disposed, and leave the sessions running', () => {
    sut.dispose()
    sut.dispose()

    expect(ends).toEqual([{ reason: 'closed' }])
    expect([screen.state, microphone.state]).toEqual(['live', 'live'])
  })

  test('should not join a session that has ended', async () => {
    await microphone.close()

    expect(() => media.join(screen, microphone)).toThrow(SessionClosedError)
  })

  test('should let no other tab take a device of the sessions while it does not allow it', () => {
    sut.allowTakeover = false

    expect([screen.allowTakeover, microphone.allowTakeover, sut.allowTakeover]).toEqual([false, false, false])
  })

  test('should be recorded as one, until the first session ends', async () => {
    const recorder = new DefaultMediaRecordingManager(
      browser.openEnvironment(),
      new DefaultScreenWakeLock(browser.openEnvironment(), new NullLogger()),
      new DefaultPageLifecycle(browser.openEnvironment(), new NullLogger()),
      new NullLogger()
    )

    const recording = await recorder.record(sut)

    expect(FakeMediaRecorder.last.stream).toBe(sut.stream)
    expect(microphone.allowTakeover).toBe(false)

    fake(screen.track).end()
    const result = await recording.finished

    expect(result.segments).toHaveLength(1)
  })
})
