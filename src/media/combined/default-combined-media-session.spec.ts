import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { DefaultDevice } from '../../core/default-device.ts'
import type { Device } from '../../core/device.ts'
import type { MediaSessionState } from '../session/media-session.ts'
import { CameraTestBench } from '../camera/testing/camera-test-bench.ts'
import { MicrophoneTestBench } from '../microphone/testing/microphone-test-bench.ts'
import { FakeAudioContext } from '../testing/fake-audio-context.ts'
import { FakeMediaBrowser } from '../testing/fake-media-browser.ts'
import type { FakeMediaStreamTrack } from '../testing/fake-media-stream-track.ts'
import type { CombinedMediaSession, CombinedMediaSessionEnd } from './combined-media-session.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

const fake = (track: MediaStreamTrack) => track as unknown as FakeMediaStreamTrack

const backCamera = { facing: 'back', require: { torch: true } } as const

describe('default-combined-media-session', () => {
  let browser!: FakeMediaBrowser

  let device!: Device

  const devices: Device[] = []

  /** another page of the browser */
  const load = () => {
    const loaded = DefaultDevice.create({}, browser.openEnvironment())
    devices.push(loaded)

    return loaded
  }

  const heldLocks = async () => ((await browser.locks.query()).held ?? []).map((lock) => lock.name).sort()

  beforeEach(() => {
    FakeAudioContext.reset()
    browser = new FakeMediaBrowser({
      inputs: [
        ...CameraTestBench.phone().filter((input) => input.kind === 'videoinput'),
        ...MicrophoneTestBench.computer(),
      ],
      oneCameraAtATime: true,
      backNeedsFacingRequest: true,
    })
    device = load()
  })

  afterEach(async () => {
    devices.splice(0).forEach((loaded) => loaded.dispose())
    await flush()

    browser.close()
    browser.devices.assertNothingRuns()
    browser.devices.assertNoViolations()
  })

  describe('lifetime', () => {
    let sut!: CombinedMediaSession
    let ends!: CombinedMediaSessionEnd[]
    let states!: MediaSessionState[]

    beforeEach(async () => {
      sut = await device.media.open({ camera: backCamera })
      ends = []
      states = []
      sut.on('ended', (end) => ends.push(end))
      sut.on('statechange', (state) => states.push(state))
    })

    test('should close both devices', async () => {
      await sut.close()

      expect(sut.state).toBe('ended')
      expect(sut.camera.state).toBe('ended')
      expect(sut.microphone.state).toBe('ended')
      expect(await heldLocks()).toEqual([])
      expect(states).toEqual(['ended'])
      expect(ends).toEqual([{ reason: 'closed' }])
    })

    test('should close only once', async () => {
      await Promise.all([sut.close(), sut.close()])
      await sut.close()

      expect(ends).toHaveLength(1)
    })

    test('should be closed at the end of an await using block', async () => {
      {
        await using scoped = sut
        expect(scoped.state).toBe('live')
      }

      expect(sut.state).toBe('ended')
    })

    test('should end, and close the microphone, when the camera ends', async () => {
      fake(sut.camera.track).end()
      await waitFor(() => ends.length > 0)

      expect(ends).toEqual([{ reason: 'device', source: 'camera' }])
      expect(sut.microphone.state).toBe('ended')
      expect(await heldLocks()).toEqual([])
    })

    test('should end, and close the camera, when the microphone ends', async () => {
      fake(sut.microphone.track).end()
      await waitFor(() => ends.length > 0)

      expect(ends).toEqual([{ reason: 'device', source: 'microphone' }])
      expect(sut.camera.state).toBe('ended')
      expect(await heldLocks()).toEqual([])
    })

    test('should end when one of its sessions is closed directly', async () => {
      await sut.camera.close()
      await waitFor(() => ends.length > 0)

      expect(ends).toEqual([{ reason: 'closed', source: 'camera' }])
      expect(sut.microphone.state).toBe('ended')
    })

    test('should end when another tab takes the camera over', async () => {
      const other = await load().camera.open({ ...backCamera, whenBusy: 'takeover' })
      await waitFor(() => ends.length > 0)

      expect(ends).toEqual([{ reason: 'taken-over', source: 'camera' }])
      expect(sut.microphone.state).toBe('ended')
      expect(other.state).toBe('live')
    })

    test('should keep both devices if the application does not allow a take-over', async () => {
      sut.allowTakeover = false

      await expect(load().camera.open({ ...backCamera, whenBusy: 'takeover' })).rejects.toMatchObject({
        name: 'MediaDeviceBusyError',
      })

      expect(sut.allowTakeover).toBe(false)
      expect(sut.camera.allowTakeover).toBe(false)
      expect(sut.microphone.allowTakeover).toBe(false)
      expect(sut.state).toBe('live')
    })

    test('should be muted while the system pauses one of the devices', async () => {
      fake(sut.microphone.track).mute()
      expect(sut.state).toBe('muted')

      fake(sut.camera.track).mute()
      fake(sut.microphone.track).unmute()
      expect(sut.state).toBe('muted')

      fake(sut.camera.track).unmute()
      expect(sut.state).toBe('live')
      expect(states).toEqual(['muted', 'live'])
    })
  })

  describe('#stream', () => {
    test('should stay the same stream and carry the new track when the camera is switched', async () => {
      const sut = await device.media.open({ camera: backCamera })
      const stream = sut.stream
      const previous = sut.camera.track

      await sut.camera.switchTo({ facing: 'front', require: {} })

      expect(sut.stream).toBe(stream)
      expect(sut.stream.getVideoTracks()).toEqual([sut.camera.track])
      expect(sut.stream.getVideoTracks()).not.toContain(previous)
      expect(sut.stream.getAudioTracks()).toEqual([sut.microphone.track])
      expect(sut.state).toBe('live')
    })

    test('should carry the new track when the microphone was started again', async () => {
      const sut = await device.media.open({ camera: backCamera, microphone: { autoRecover: true } })
      // the bench shortens this wait for its own managers, a device waits a second
      await new Promise((resolve) => setTimeout(resolve, 1050))
      const previous = sut.microphone.track

      fake(previous).end()
      await waitFor(() => sut.microphone.track !== previous)

      expect(sut.stream.getAudioTracks()).toEqual([sut.microphone.track])
      expect(sut.stream.getVideoTracks()).toEqual([sut.camera.track])
      expect(sut.state).toBe('live')
    })
  })
})
