import { describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { DefaultDevice } from './default-device.ts'
import { DeviceEnvironment } from './environment/device-environment.ts'
import { InTabBroadcastChannel } from './coordination/channel/in-tab-broadcast-channel.ts'
import { InTabLockManager } from './coordination/lock/in-tab-lock-manager.ts'
import type { Logger } from './logging/logger.ts'
import { DefaultCameraManager } from '../media/camera/default-camera-manager.ts'
import { CameraTestBench } from '../media/camera/testing/camera-test-bench.ts'
import { DefaultMediaManager } from '../media/combined/default-media-manager.ts'
import { MediaError } from '../media/errors/media-error.ts'
import { DefaultMicrophoneManager } from '../media/microphone/default-microphone-manager.ts'
import { FakeMediaBrowser } from '../media/testing/fake-media-browser.ts'
import { DefaultDeviceLocation } from '../location/default-device-location.ts'
import { FakeGeolocation } from '../location/testing/fake-geolocation.ts'
import { DefaultDeviceOrientation } from '../platform/default-device-orientation.ts'
import { DefaultDevicePlatform } from '../platform/default-device-platform.ts'
import { DefaultPermissionManager } from '../permission/default-permission-manager.ts'
import { DefaultTabCoordination } from './coordination/default-tab-coordination.ts'

describe('default-device', () => {
  describe('#create', () => {
    test('should not touch the environment', async () => {
      const resolveGlobals = vi.fn(() => ({}))

      DefaultDevice.create({}, new DeviceEnvironment(resolveGlobals))

      expect(resolveGlobals).not.toHaveBeenCalled()
    })

    test('should work without arguments and outside a browser', async () => {
      expect(() => DefaultDevice.create()).not.toThrow()
    })

    test('should return a new device on every call', async () => {
      expect(DefaultDevice.create()).not.toBe(DefaultDevice.create())
    })

    test('should not log anything', async () => {
      const logger = mock<Logger>()

      DefaultDevice.create({ logger }, DeviceEnvironment.of({}))

      expect(logger.debug).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('#coordination', () => {
    test('should report cross-tab coordination if the browser has Web Locks', async () => {
      const navigator = { locks: new InTabLockManager() } as unknown as Navigator

      const sut = DefaultDevice.create({}, DeviceEnvironment.of({ navigator }))

      expect(sut.coordination).toBeInstanceOf(DefaultTabCoordination)
      expect(sut.coordination.isCrossTab).toBe(true)
    })

    test('should report no cross-tab coordination without Web Locks', async () => {
      const sut = DefaultDevice.create({}, DeviceEnvironment.of({}))

      expect(sut.coordination.isCrossTab).toBe(false)
    })
  })

  describe('#permission', () => {
    test('should report every permission as unsupported outside a browser', async () => {
      const sut = DefaultDevice.create({}, DeviceEnvironment.of({}))

      expect(sut.permission).toBeInstanceOf(DefaultPermissionManager)
      expect(await sut.permission.query('camera')).toBe('unsupported')
      expect(await sut.permission.query('microphone')).toBe('unsupported')
      expect(await sut.permission.query('geolocation')).toBe('unsupported')
      expect(await sut.permission.query('persistent-storage')).toBe('unsupported')
    })

    test('should request the camera for both facings and the microphone, each under its lock', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDevice.create({}, browser.openEnvironment())

      expect(await sut.permission.request('camera')).toBe('granted')
      expect(await sut.permission.request('microphone')).toBe('granted')

      expect(browser.devices.requests).toEqual([
        { video: { facingMode: { exact: 'environment' } } },
        { video: { facingMode: { exact: 'user' } } },
        { audio: true },
      ])
      expect(browser.devices.violations).toEqual([])
      expect(browser.devices.liveTracks).toEqual([])
    })
  })

  describe('#camera', () => {
    const torchCamera = { facing: 'back', require: { torch: true }, resolution: { width: 1920, height: 1080 } } as const

    test('should be configured with the camera section', async () => {
      const sut = DefaultDevice.create({ camera: torchCamera }, DeviceEnvironment.of({}))

      expect(sut.camera).toBeInstanceOf(DefaultCameraManager)
      expect(sut.camera.configuration).toEqual(torchCamera)
    })

    test('should open the configured camera', async () => {
      const browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
      using sut = DefaultDevice.create({ camera: torchCamera }, browser.openEnvironment())

      await using session = await sut.camera.open()

      expect(session.descriptor.id).toBe('back-main')
      expect(session.torch).toBeDefined()
      expect(browser.devices.violations).toEqual([])
    })

    test('should request the permission for the configured facing only', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDevice.create({ camera: { facing: 'front' } }, browser.openEnvironment())

      expect(await sut.permission.request('camera')).toBe('granted')

      expect(browser.devices.requests).toEqual([{ video: { facingMode: { exact: 'user' } } }])
    })

    test('should follow a configuration that is changed later', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDevice.create({ camera: { facing: 'front' } }, browser.openEnvironment())
      sut.camera.configure({ facing: 'back' })

      await sut.permission.request('camera')

      expect(browser.devices.requests).toEqual([{ video: { facingMode: { exact: 'environment' } } }])
    })

    test('should close its sessions when the device is disposed', async () => {
      const browser = new FakeMediaBrowser()
      const sut = DefaultDevice.create({}, browser.openEnvironment())
      const session = await sut.camera.open({ facing: 'back' })

      sut.dispose()
      await new Promise((resolve) => setTimeout(resolve))

      expect(session.state).toBe('ended')
      expect(browser.devices.liveTracks).toEqual([])
    })
  })

  describe('#initialize', () => {
    const torchCamera = { facing: 'back', require: { torch: true }, resolution: { width: 1920, height: 1080 } } as const

    test('should prepare the camera and report what it found', async () => {
      const browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
      using sut = DefaultDevice.create({ camera: torchCamera }, browser.openEnvironment())

      const result = await sut.initialize()

      expect(result.camera?.permission).toBe('granted')
      expect(result.camera?.selected?.id).toBe('back-main')
      expect(result.camera?.isResolutionAvailable).toBe(true)
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should not ask for a microphone the application did not configure', async () => {
      const browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
      using sut = DefaultDevice.create({ camera: torchCamera }, browser.openEnvironment())

      const result = await sut.initialize()

      expect(result.microphone).toBeUndefined()
      expect(JSON.stringify(browser.devices.requests)).not.toContain('audio')
    })

    test('should only prepare the microphone if only the microphone is configured', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDevice.create({ microphone: {} }, browser.openEnvironment())

      const result = await sut.initialize()

      expect(result.camera).toBeUndefined()
      expect(result.microphone?.permission).toBe('granted')
    })

    test('should let the call override the configuration', async () => {
      const browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
      using sut = DefaultDevice.create({ camera: torchCamera }, browser.openEnvironment())

      const result = await sut.initialize({ camera: { facing: 'front', require: {} } })

      expect(result.camera?.selected?.facing).toBe('front')
    })

    test('should only prepare what was asked for', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDevice.create({}, browser.openEnvironment())

      expect(await sut.initialize({})).toEqual({})
      expect(await sut.initialize({ camera: false })).toEqual({})
      expect(browser.devices.calls).toEqual([])
    })

    test('should report instead of throwing where there are no cameras', async () => {
      using sut = DefaultDevice.create({}, DeviceEnvironment.of({}))

      const result = await sut.initialize({ camera: true })

      expect(result.camera?.permission).toBe('unsupported')
      expect(result.camera?.error?.name).toBe('UnsupportedError')
    })
  })

  describe('#microphone', () => {
    test('should be configured with the microphone section', async () => {
      const sut = DefaultDevice.create(
        { microphone: { processing: { noiseSuppression: false } } },
        DeviceEnvironment.of({})
      )

      expect(sut.microphone).toBeInstanceOf(DefaultMicrophoneManager)
      expect(sut.microphone.configuration).toEqual({ processing: { noiseSuppression: false } })
    })

    test('should open the configured microphone next to a camera', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDevice.create({}, browser.openEnvironment())

      await using camera = await sut.camera.open({ facing: 'back' })
      await using microphone = await sut.microphone.open()

      expect(camera.state).toBe('live')
      expect(microphone.track.kind).toBe('audio')
      expect(browser.devices.violations).toEqual([])
    })

    test('should prepare the camera and the microphone with initialize()', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDevice.create({}, browser.openEnvironment())

      const result = await sut.initialize()

      expect(result.camera?.permission).toBe('granted')
      expect(result.microphone?.permission).toBe('granted')
      expect(result.microphone?.selected?.id).toBe('microphone-0')
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should report a refused microphone and still prepare the camera', async () => {
      const browser = new FakeMediaBrowser()
      browser.devices.permission.microphone = 'denied'
      using sut = DefaultDevice.create({}, browser.openEnvironment())

      const result = await sut.initialize({ camera: { facing: 'back' }, microphone: true })

      expect(result.camera?.selected).toBeDefined()
      expect(result.microphone?.permission).toBe('denied')
      expect(result.microphone?.error?.name).toBe('PermissionDeniedError')
    })
  })

  describe('#media', () => {
    test('should open a camera and a microphone together', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDevice.create({}, browser.openEnvironment())

      await using session = await sut.media.open({ camera: { facing: 'back' } })

      expect(sut.media).toBeInstanceOf(DefaultMediaManager)
      expect(session.stream.getTracks()).toHaveLength(2)
    })
  })

  describe('#location', () => {
    test('should determine where the device is', async () => {
      const geolocation = new FakeGeolocation()
      using sut = DefaultDevice.create({}, DeviceEnvironment.of({ navigator: { geolocation } as unknown as Navigator }))

      const locating = sut.location.current()
      geolocation.moveTo({ latitude: 52.52, longitude: 13.405 })

      expect(sut.location).toBeInstanceOf(DefaultDeviceLocation)
      expect(await locating).toMatchObject({ latitude: 52.52, longitude: 13.405 })
    })

    test('should stop the watches when the device is disposed', async () => {
      const geolocation = new FakeGeolocation()
      const sut = DefaultDevice.create({}, DeviceEnvironment.of({ navigator: { geolocation } as unknown as Navigator }))
      const watch = sut.location.watch()

      sut.dispose()

      expect(watch.isActive).toBe(false)
    })
  })

  describe('#orientation', () => {
    test('should tell how the device is held', async () => {
      const window = { matchMedia: () => ({ matches: false }) } as unknown as Window
      using sut = DefaultDevice.create({}, DeviceEnvironment.of({ window, document: {} as Document }))

      expect(sut.orientation).toBeInstanceOf(DefaultDeviceOrientation)
      expect(sut.orientation.current).toBe('landscape')
    })
  })

  describe('#platform', () => {
    test('should tell the platform of the device', async () => {
      const navigator = { platform: 'iPhone' } as Navigator

      const sut = DefaultDevice.create({}, DeviceEnvironment.of({ navigator }))

      expect(sut.platform).toBeInstanceOf(DefaultDevicePlatform)
      expect(sut.platform.isIos).toBe(true)
    })
  })

  describe('#dispose', () => {
    test('should be callable on a device that was never used, any number of times', async () => {
      const BroadcastChannel = vi.fn(InTabBroadcastChannel)
      const sut = DefaultDevice.create({}, DeviceEnvironment.of({ BroadcastChannel }))

      sut.dispose()
      sut.dispose()

      expect(BroadcastChannel).not.toHaveBeenCalled()
    })

    test('should be disposed at the end of a using block', async () => {
      const dispose = vi.spyOn(DefaultDevice.prototype, 'dispose')

      {
        using sut = DefaultDevice.create({}, DeviceEnvironment.of({}))
        expect(sut).toBeInstanceOf(DefaultDevice)
      }

      expect(dispose).toHaveBeenCalledTimes(1)
      dispose.mockRestore()
    })

    test('should resolve once the camera is free for the other tabs', async () => {
      const browser = new FakeMediaBrowser()
      const sut = DefaultDevice.create({}, browser.openEnvironment())
      using other = DefaultDevice.create({}, browser.openEnvironment())
      await sut.camera.open({ facing: 'back' })

      await sut.dispose()

      expect((await browser.locks.query()).held).toEqual([])
      await using session = await other.camera.open({ facing: 'back' })
      expect(session.state).toBe('live')
    })

    test('should be disposed at the end of an await using block', async () => {
      const browser = new FakeMediaBrowser()
      {
        await using sut = DefaultDevice.create({}, browser.openEnvironment())
        await sut.camera.open({ facing: 'back' })
      }

      expect(browser.devices.liveTracks).toEqual([])
      expect((await browser.locks.query()).held).toEqual([])
    })

    test('should not open a camera or a microphone any more', async () => {
      const browser = new FakeMediaBrowser()
      const sut = DefaultDevice.create({}, browser.openEnvironment())

      await sut.dispose()

      await expect(sut.camera.open()).rejects.toThrow(MediaError)
      await expect(sut.microphone.open()).rejects.toThrow(/disposed/)
      expect(browser.devices.calls).toEqual([])
    })
  })
})
