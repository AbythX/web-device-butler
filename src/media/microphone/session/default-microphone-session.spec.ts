import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { MediaDeviceBusyError } from '../../errors/media-device-busy-error.ts'
import { SessionClosedError } from '../../errors/session-closed-error.ts'
import type { MediaSessionEnd, MediaSessionState } from '../../session/media-session.ts'
import { FakeAudioContext } from '../../testing/fake-audio-context.ts'
import { FakeMediaBrowser } from '../../testing/fake-media-browser.ts'
import { FakeMediaStream } from '../../testing/fake-media-stream.ts'
import { FakeMediaStreamTrack } from '../../testing/fake-media-stream-track.ts'
import { DefaultLevelMeter } from '../level/default-level-meter.ts'
import type { MicrophoneManager } from '../microphone-manager.ts'
import type { MicrophoneRequirements } from '../model/microphone-requirements.ts'
import type { MicrophoneSettings } from '../model/microphone-settings.ts'
import { MicrophoneTestBench } from '../testing/microphone-test-bench.ts'
import type { MicrophoneSession } from './microphone-session.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

const fakeTrackOf = (session: MicrophoneSession) => session.track as unknown as FakeMediaStreamTrack

describe('default-microphone-session', () => {
  let browser!: FakeMediaBrowser
  let manager!: MicrophoneManager
  let sut!: MicrophoneSession

  const reopen = async (requirements: MicrophoneRequirements, timing = MicrophoneTestBench.timing, logger?: Logger) => {
    await sut.close()
    manager.dispose()
    manager = MicrophoneTestBench.load(browser, {}, timing, logger)
    sut = await manager.open(requirements)
  }

  beforeEach(async () => {
    FakeAudioContext.reset()
    browser = new FakeMediaBrowser({ inputs: MicrophoneTestBench.computer() })
    manager = MicrophoneTestBench.load(browser)
    sut = await manager.open()
  })

  afterEach(async () => {
    manager.dispose()
    await flush()

    browser.close()
    browser.devices.assertNothingRuns()
    browser.devices.assertNoViolations()
  })

  describe('#settings', () => {
    test('should report what the microphone delivers', async () => {
      expect(sut.settings).toMatchObject({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48_000,
      })
    })
  })

  describe('#processing', () => {
    test('should tell which processing the microphone has', async () => {
      expect(sut.processing.available).toEqual(['echoCancellation', 'noiseSuppression', 'autoGainControl'])
    })

    test('should have nothing available on a microphone without processing', async () => {
      await reopen({ id: 'stereo' })

      expect(sut.processing.available).toEqual([])
      expect(sut.processing.echoCancellation).toBe(false)
    })

    test('should switch processing off and on', async () => {
      await sut.processing.set({ noiseSuppression: false })

      expect(sut.processing.noiseSuppression).toBe(false)
      expect(sut.processing.echoCancellation).toBe(true)
      expect(sut.processing.autoGainControl).toBe(true)

      await sut.processing.set({ noiseSuppression: true, echoCancellation: false })

      expect(sut.processing.noiseSuppression).toBe(true)
      expect(sut.processing.echoCancellation).toBe(false)
    })

    test('should leave a field that is not set as it is', async () => {
      await sut.processing.set({ autoGainControl: false })

      await sut.processing.set({ autoGainControl: undefined, noiseSuppression: false })

      expect(sut.settings).toMatchObject({ autoGainControl: false, noiseSuppression: false, echoCancellation: true })
    })

    test('should keep the microphone running', async () => {
      const track = sut.track

      await sut.processing.set({ echoCancellation: false })

      expect(sut.track).toBe(track)
      expect(track.readyState).toBe('live')
    })

    test('should announce the new settings', async () => {
      const announced: MicrophoneSettings[] = []
      sut.on('settingschange', (settings) => announced.push(settings))

      await sut.processing.set({ noiseSuppression: false })
      await sut.processing.set({ noiseSuppression: false })

      expect(announced).toHaveLength(1)
      expect(announced[0]?.noiseSuppression).toBe(false)
    })

    test('should apply overlapping changes one after another', async () => {
      await Promise.all([
        sut.processing.set({ noiseSuppression: false }),
        sut.processing.set({ echoCancellation: false }),
      ])

      expect(fakeTrackOf(sut).overlappingChanges).toBe(1)
      expect(sut.settings).toMatchObject({ noiseSuppression: false, echoCancellation: false })
    })

    test('should fail after the session was closed', async () => {
      await sut.close()

      await expect(sut.processing.set({ noiseSuppression: false })).rejects.toThrow(SessionClosedError)
    })
  })

  describe('#processing in a browser that cannot change a running microphone', () => {
    beforeEach(async () => {
      await sut.close()
      manager.dispose()
      browser.close()

      const inputs = MicrophoneTestBench.computer()
      inputs.forEach((input) => (input.processingOnlyAtStart = true))
      inputs.push({
        deviceId: 'fixed',
        kind: 'audioinput',
        label: 'Microphone without processing',
        capabilities: { echoCancellation: [false], noiseSuppression: [false], autoGainControl: [false] },
        processingOnlyAtStart: true,
      })
      browser = new FakeMediaBrowser({ inputs })
      manager = MicrophoneTestBench.load(browser)
      sut = await manager.open()
    })

    /** the next starts of a microphone fail, the way they do while another application holds it */
    const failStarts = (times: number) => {
      const audit = browser.devices.beforeCall
      let remaining = times

      browser.devices.beforeCall = async (call) => {
        await audit?.(call)

        if (call.method === 'getUserMedia' && remaining-- > 0) {
          throw new DOMException('Could not start audio source', 'NotReadableError')
        }
      }
    }

    test('should return to the microphone it had if it does not start with the new processing', async () => {
      failStarts(1)

      await expect(sut.processing.set({ noiseSuppression: false })).rejects.toThrow(MediaDeviceBusyError)

      expect(sut.state).toBe('live')
      expect(sut.track.readyState).toBe('live')
      expect(sut.processing.noiseSuppression).toBe(true)
      expect(browser.devices.liveTracks).toHaveLength(1)
    })

    test('should end if the microphone does not start again at all', async () => {
      const ended: MediaSessionEnd[] = []
      sut.on('ended', (end) => ended.push(end))
      failStarts(2)

      await expect(sut.processing.set({ noiseSuppression: false })).rejects.toThrow(MediaDeviceBusyError)

      expect(sut.state).toBe('ended')
      expect(ended).toEqual([{ reason: 'device' }])
    })

    test('should start the microphone again with the new processing', async () => {
      const previous = sut.track
      const tracks: MediaStreamTrack[] = []
      sut.on('trackchange', (track) => tracks.push(track))

      await sut.processing.set({ noiseSuppression: false })

      expect(sut.processing.noiseSuppression).toBe(false)
      expect(sut.processing.echoCancellation).toBe(true)
      expect(sut.track).not.toBe(previous)
      expect(tracks).toEqual([sut.track])
      expect(previous.readyState).toBe('ended')
      expect(sut.state).toBe('live')
      expect(browser.devices.liveTracks).toHaveLength(1)
    })

    test('should be muted while the microphone is started again', async () => {
      const states: MediaSessionState[] = []
      sut.on('statechange', (state) => states.push(state))

      await sut.processing.set({ noiseSuppression: false })

      expect(states).toEqual(['muted', 'live'])
    })

    test('should stay on the same microphone', async () => {
      await sut.close()
      sut = await manager.open({ id: 'builtin' })

      await sut.processing.set({ echoCancellation: false })

      expect(sut.descriptor.id).toBe('builtin')
      expect(sut.settings.echoCancellation).toBe(false)
    })

    test('should keep earlier changes and the mute of the application', async () => {
      sut.muted = true
      await sut.processing.set({ noiseSuppression: false })

      await sut.processing.set({ autoGainControl: false })

      expect(sut.settings).toMatchObject({ noiseSuppression: false, autoGainControl: false, echoCancellation: true })
      expect(sut.track.enabled).toBe(false)
    })

    test('should announce the new settings once', async () => {
      const announced: MicrophoneSettings[] = []
      sut.on('settingschange', (settings) => announced.push(settings))

      await sut.processing.set({ noiseSuppression: false })

      expect(announced).toHaveLength(1)
    })

    test('should not start the microphone again for a change that changes nothing', async () => {
      const track = sut.track

      await sut.processing.set({ noiseSuppression: true })

      expect(sut.track).toBe(track)
    })

    test('should not start a microphone again for a processing it does not have', async () => {
      await sut.close()
      sut = await manager.open({ id: 'fixed' })
      const track = sut.track

      await sut.processing.set({ noiseSuppression: true })

      expect(sut.track).toBe(track)
      expect(sut.processing.noiseSuppression).toBe(false)
    })

    test('should handle overlapping changes one after another', async () => {
      await Promise.all([
        sut.processing.set({ noiseSuppression: false }),
        sut.processing.set({ echoCancellation: false }),
      ])

      expect(sut.settings).toMatchObject({ noiseSuppression: false, echoCancellation: false })
      expect(browser.devices.liveTracks).toHaveLength(1)
    })

    test('should keep measuring the level on the new stream', async () => {
      const levels: number[] = []
      sut.level?.on('change', (level) => levels.push(level))
      await waitFor(() => levels.length >= 1)

      await sut.processing.set({ noiseSuppression: false })

      expect(FakeAudioContext.instances[0]?.sources.at(-1)).toBe(sut.stream)
      expect(FakeAudioContext.instances[0]?.connected).toBe(1)
    })
  })

  describe('#muted', () => {
    test('should silence the microphone without stopping it', async () => {
      sut.muted = true

      expect(sut.muted).toBe(true)
      expect(sut.track.enabled).toBe(false)
      expect(sut.track.readyState).toBe('live')
      expect(sut.state).toBe('live')

      sut.muted = false

      expect(sut.track.enabled).toBe(true)
    })

    test('should announce a change once', async () => {
      const changes: boolean[] = []
      sut.on('mutechange', (muted) => changes.push(muted))

      sut.muted = true
      sut.muted = true
      sut.muted = false

      expect(changes).toEqual([true, false])
    })
  })

  describe('#level', () => {
    test('should measure nothing while nobody listens', async () => {
      await flush()

      expect(sut.level?.isRunning).toBe(false)
      expect(sut.level?.level).toBe(0)
      expect(FakeAudioContext.instances).toEqual([])
    })

    test('should report how loud the microphone is while someone listens', async () => {
      const levels: number[] = []
      sut.level?.on('change', (level) => levels.push(level))
      await waitFor(() => levels.length >= 2)

      expect(levels[0]).toBeCloseTo(0.5)
      expect(sut.level?.level).toBeCloseTo(0.5)
      expect(sut.level?.isRunning).toBe(true)
      expect(FakeAudioContext.instances[0]?.sources).toEqual([sut.stream])
    })

    test('should follow the signal', async () => {
      const levels: number[] = []
      sut.level?.on('change', (level) => levels.push(level))
      await waitFor(() => levels.length >= 1)

      FakeAudioContext.amplitude = 0.1
      await waitFor(() => (levels.at(-1) ?? 1) < 0.2)

      expect(levels.at(-1)).toBeCloseTo(0.1)
    })

    test('should never report more than 1', async () => {
      FakeAudioContext.amplitude = 3
      const levels: number[] = []
      sut.level?.on('change', (level) => levels.push(level))
      await waitFor(() => levels.length >= 1)

      expect(levels[0]).toBe(1)
    })

    test('should report silence for a microphone the application muted', async () => {
      sut.muted = true
      const levels: number[] = []
      sut.level?.on('change', (level) => levels.push(level))
      await waitFor(() => levels.length >= 1)

      expect(levels[0]).toBe(0)
    })

    test('should stop measuring when the last listener is gone', async () => {
      const subscription = sut.level?.on('change', () => undefined)
      await flush()
      const [context] = FakeAudioContext.instances

      subscription?.unsubscribe()

      expect(sut.level?.isRunning).toBe(false)
      expect(sut.level?.level).toBe(0)
      expect(context?.state).toBe('closed')
      expect(context?.connected).toBe(0)
    })

    test('should start again for a new listener', async () => {
      sut.level?.on('change', () => undefined).unsubscribe()

      const levels: number[] = []
      sut.level?.on('change', (level) => levels.push(level))
      await waitFor(() => levels.length >= 1)

      expect(FakeAudioContext.instances).toHaveLength(2)
      expect(levels[0]).toBeCloseTo(0.5)
    })

    test('should stop measuring when the session is closed', async () => {
      const levels: number[] = []
      sut.level?.on('change', (level) => levels.push(level))
      await waitFor(() => levels.length >= 1)

      await sut.close()
      const reported = levels.length
      await flush()
      await flush()

      expect(sut.level?.isRunning).toBe(false)
      expect(levels).toHaveLength(reported)
      expect(FakeAudioContext.instances[0]?.state).toBe('closed')
    })

    test('should report nothing while the browser does not let the audio context run', async () => {
      const suspended = class extends FakeAudioContext {
        public override resume(): Promise<void> {
          return new Promise(() => undefined)
        }
      }

      const environment = BrowserEnvironment.of({ AudioContext: suspended as unknown as new () => AudioContext })
      const meter = new DefaultLevelMeter(sut.stream, environment, new NullLogger(), 1)
      const levels: number[] = []

      meter.on('change', (level) => levels.push(level))
      await flush()
      await flush()
      meter.dispose()

      expect(levels).toEqual([])
    })

    test('should not exist where the browser has no Web Audio', async () => {
      browser.close()
      browser = new FakeMediaBrowser({ inputs: MicrophoneTestBench.computer() }, { AudioContext: undefined })
      manager = MicrophoneTestBench.load(browser)

      sut = await manager.open()

      expect(sut.level).toBeUndefined()
    })

    test('should use the audio context under the name Safari had for it', async () => {
      const environment = BrowserEnvironment.of({
        webkitAudioContext: FakeAudioContext as unknown as new () => AudioContext,
      })

      const track = new FakeMediaStreamTrack({ kind: 'audio', deviceId: 'a', label: 'a' })
      const stream = new FakeMediaStream([track]) as unknown as MediaStream
      const meter = new DefaultLevelMeter(stream, environment, new NullLogger(), 1)
      const levels: number[] = []

      meter.on('change', (level) => levels.push(level))
      await waitFor(() => levels.length >= 1)
      meter.dispose()

      expect(levels[0]).toBeCloseTo(0.5)
      expect(meter.isRunning).toBe(false)
    })

    test('should log and stay silent if the audio context cannot be used', async () => {
      const logger = mock<Logger>()

      const environment = BrowserEnvironment.of({
        AudioContext: class {
          public constructor() {
            throw new Error('too many audio contexts')
          }
        } as unknown as new () => AudioContext,
      })

      const meter = new DefaultLevelMeter(sut.stream, environment, logger, 1)

      meter.on('change', () => undefined)
      await flush()

      expect(meter.isRunning).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith('Could not measure the level of the microphone', expect.any(Error))
    })
  })

  describe('autoRecover', () => {
    test('should end the session when the system ends the microphone, by default', async () => {
      const ends: MediaSessionEnd[] = []
      sut.on('ended', (end) => ends.push(end))

      fakeTrackOf(sut).end()
      await waitFor(() => ends.length > 0)

      expect(ends).toEqual([{ reason: 'device' }])
    })

    test('should start the microphone again when the system ends it', async () => {
      await reopen({ autoRecover: true })
      const previous = sut.track
      const states: MediaSessionState[] = []
      sut.on('statechange', (state) => states.push(state))

      fakeTrackOf(sut).end()
      await waitFor(() => sut.track !== previous)

      expect(states).toEqual(['muted', 'live'])
      expect(sut.track.readyState).toBe('live')
      expect(sut.descriptor.id).toBe('headset')
    })

    test('should continue the way the application left the microphone', async () => {
      await reopen({ autoRecover: true })
      await sut.processing.set({ noiseSuppression: false })
      sut.muted = true
      const previous = sut.track

      fakeTrackOf(sut).end()
      await waitFor(() => sut.track !== previous)

      expect(sut.settings.noiseSuppression).toBe(false)
      expect(sut.muted).toBe(true)
      expect(sut.track.enabled).toBe(false)
    })

    test('should not switch a processing on again that was required and is switched off since', async () => {
      await reopen({ autoRecover: true, require: { noiseSuppression: true } })
      await sut.processing.set({ noiseSuppression: false })
      const previous = sut.track

      fakeTrackOf(sut).end()
      await waitFor(() => sut.track !== previous)

      expect(sut.settings.noiseSuppression).toBe(false)
    })

    test('should keep measuring the level, on the new stream', async () => {
      await reopen({ autoRecover: true })
      const levels: number[] = []
      sut.level?.on('change', (level) => levels.push(level))
      await waitFor(() => levels.length >= 1)
      const previous = sut.stream

      fakeTrackOf(sut).end()
      await waitFor(() => sut.stream !== previous)
      const reported = levels.length
      await waitFor(() => levels.length > reported)

      expect(FakeAudioContext.instances).toHaveLength(1)
      expect(FakeAudioContext.instances[0]?.sources).toEqual([previous, sut.stream])
      expect(FakeAudioContext.instances[0]?.connected).toBe(1)
    })

    test('should not start a microphone again that ended right after it was started', async () => {
      const logger = mock<Logger>()
      await reopen({ autoRecover: true }, { ...MicrophoneTestBench.timing, recoverMinLifetime: 60_000 }, logger)
      const requests = browser.devices.requests.length

      fakeTrackOf(sut).end()
      await waitFor(() => sut.state === 'ended')

      expect(sut.state).toBe('ended')
      expect(browser.devices.requests).toHaveLength(requests)
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not starting it again'))
    })

    test('should end the session if the microphone does not start again', async () => {
      await reopen({ autoRecover: true })
      browser.devices.beforeCall = ({ method }) => {
        if (method === 'getUserMedia') {
          throw new DOMException('Could not start audio source', 'NotReadableError')
        }
      }

      fakeTrackOf(sut).end()
      await waitFor(() => sut.state === 'ended')

      expect(sut.state).toBe('ended')
    })
  })
})
