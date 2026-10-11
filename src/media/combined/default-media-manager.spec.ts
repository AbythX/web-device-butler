import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { DefaultDevice } from '../../core/default-device.ts'
import type { Device } from '../../core/device.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { CameraTestBench } from '../camera/testing/camera-test-bench.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import { MicrophoneTestBench } from '../microphone/testing/microphone-test-bench.ts'
import { FakeAudioContext } from '../testing/fake-audio-context.ts'
import { FakeMediaBrowser } from '../testing/fake-media-browser.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const backCamera = { facing: 'back', require: { torch: true } } as const

describe('default-media-manager', () => {
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

  describe('#open', () => {
    test('should run a camera and a microphone and deliver one stream', async () => {
      const sut = await device.media.open({ camera: backCamera })

      expect(sut.camera.descriptor.id).toBe('back-main')
      expect(sut.microphone.descriptor.id).toBe('headset')
      expect(sut.stream.getVideoTracks()).toEqual([sut.camera.track])
      expect(sut.stream.getAudioTracks()).toEqual([sut.microphone.track])
      expect(sut.state).toBe('live')
    })

    test('should hold both devices', async () => {
      await device.media.open({ camera: backCamera })

      expect(await heldLocks()).toEqual(['web-device-butler:camera', 'web-device-butler:microphone'])
    })

    test('should use the configuration of each device and let the call override it', async () => {
      device = DefaultDevice.create(
        { camera: backCamera, microphone: { require: { minChannelCount: 2 } } },
        browser.openEnvironment()
      )
      devices.push(device)

      const configured = await device.media.open()
      expect(configured.camera.descriptor.id).toBe('back-main')
      expect(configured.microphone.descriptor.id).toBe('stereo')
      await configured.close()

      const overridden = await device.media.open({
        camera: { facing: 'front', require: {} },
        microphone: { require: {} },
      })

      expect(overridden.camera.descriptor.facing).toBe('front')
      expect(overridden.microphone.descriptor.id).toBe('headset')
    })

    test('should offer the controls of both devices', async () => {
      const sut = await device.media.open({ camera: backCamera })

      await sut.camera.torch?.set(true)
      await sut.microphone.processing.set({ noiseSuppression: false })

      expect(sut.camera.torch?.enabled).toBe(true)
      expect(sut.microphone.settings.noiseSuppression).toBe(false)
    })

    test('should close the camera again if the microphone cannot be opened', async () => {
      browser.devices.permission.microphone = 'denied'

      await expect(device.media.open({ camera: backCamera })).rejects.toThrow(PermissionDeniedError)

      expect(await heldLocks()).toEqual([])
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should close both devices if they cannot be combined', async () => {
      class BrokenStream {
        public addTrack(): void {
          throw new TypeError('The stream takes no tracks')
        }
      }

      browser = new FakeMediaBrowser(
        { inputs: [...CameraTestBench.phone(), ...MicrophoneTestBench.computer()], oneCameraAtATime: true },
        { MediaStream: BrokenStream as unknown as new (tracks: MediaStreamTrack[]) => MediaStream }
      )

      await expect(load().media.open({ camera: backCamera })).rejects.toThrow(TypeError)

      expect(await heldLocks()).toEqual([])
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should not start the microphone if the camera cannot be opened', async () => {
      const opening = device.media.open({ camera: { facing: 'front', require: { torch: true } } })

      await expect(opening).rejects.toThrow(MediaRequirementsError)
      expect(JSON.stringify(browser.devices.requests)).not.toContain('audio')
      expect(await heldLocks()).toEqual([])
    })

    test('should fail before a device is started where the browser has no media streams', async () => {
      browser = new FakeMediaBrowser(undefined, { MediaStream: undefined })

      await expect(load().media.open()).rejects.toThrow(UnsupportedError)
      expect(browser.devices.calls).toEqual([])
    })
  })
})
