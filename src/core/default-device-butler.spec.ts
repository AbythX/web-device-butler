import { describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { DefaultDeviceButler } from './default-device-butler.ts'
import { BrowserEnvironment } from './environment/browser-environment.ts'
import { InTabBroadcastChannel } from './coordination/channel/in-tab-broadcast-channel.ts'
import { InTabLockManager } from './coordination/lock/in-tab-lock-manager.ts'
import type { Logger } from './logging/logger.ts'
import { DefaultCameraManager } from '../media/camera/default-camera-manager.ts'
import { CameraTestBench } from '../media/camera/testing/camera-test-bench.ts'
import { DefaultMediaManager } from '../media/combined/default-media-manager.ts'
import { MediaError } from '../media/errors/media-error.ts'
import { DefaultMicrophoneManager } from '../media/microphone/default-microphone-manager.ts'
import { DefaultDeviceNotifications } from '../attention/notifications/default-device-notifications.ts'
import { FakeNotification } from '../attention/testing/fake-notifications.ts'
import { DefaultDeviceVibration } from '../attention/vibration/default-device-vibration.ts'
import { DefaultCodeScanner } from '../media/scanning/default-code-scanner.ts'
import { DefaultDeviceMotion } from '../motion/default-device-motion.ts'
import { FakeEventTarget } from './testing/fake-event-target.ts'
import { FakeBarcodeDetector } from '../media/scanning/testing/fake-barcode-detector.ts'
import { DefaultScreenCaptureManager } from '../media/screen-capture/default-screen-capture-manager.ts'
import { FakeMediaBrowser } from '../media/testing/fake-media-browser.ts'
import { DefaultDeviceLocation } from '../location/default-device-location.ts'
import { FakeGeolocation } from '../location/testing/fake-geolocation.ts'
import { DefaultDeviceOrientation } from '../platform/default-device-orientation.ts'
import { DefaultDevicePlatform } from '../platform/default-device-platform.ts'
import { DefaultPermissionManager } from '../permission/default-permission-manager.ts'
import { DefaultTabCoordination } from './coordination/default-tab-coordination.ts'
import { DefaultAudioOutputManager } from '../media/output/default-audio-output-manager.ts'
import { DefaultMediaRecordingManager } from '../media/recording/default-media-recording-manager.ts'
import { DefaultDeviceFiles } from '../files/default-device-files.ts'
import { DefaultDeviceNetwork } from '../network/default-device-network.ts'
import { DefaultOutboxManager } from '../outbox/default-outbox-manager.ts'
import { DefaultPageLifecycle } from '../platform/page/default-page-lifecycle.ts'
import { DefaultScreenFullscreen } from '../screen/fullscreen/default-screen-fullscreen.ts'
import { DefaultScreenWakeLock } from '../screen/wake-lock/default-screen-wake-lock.ts'
import { DefaultDeviceClipboard } from '../sharing/clipboard/default-device-clipboard.ts'
import { DefaultDeviceShare } from '../sharing/share/default-device-share.ts'
import { FakeMediaRecorder } from '../media/recording/testing/fake-media-recorder.ts'
import { FakeRecordingSource } from '../media/recording/testing/fake-recording-source.ts'
import type { BrowserGlobals } from './environment/browser-environment.ts'

describe('default-device-butler', () => {
  describe('#create', () => {
    test('should not touch the environment', async () => {
      const resolveGlobals = vi.fn(() => ({}))

      DefaultDeviceButler.create({}, new BrowserEnvironment(resolveGlobals))

      expect(resolveGlobals).not.toHaveBeenCalled()
    })

    test('should work without arguments and outside a browser', async () => {
      expect(() => DefaultDeviceButler.create()).not.toThrow()
    })

    test('should return a new butler on every call', async () => {
      expect(DefaultDeviceButler.create()).not.toBe(DefaultDeviceButler.create())
    })

    test('should not log anything', async () => {
      const logger = mock<Logger>()

      DefaultDeviceButler.create({ logger }, BrowserEnvironment.of({}))

      expect(logger.debug).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('#coordination', () => {
    test('should report cross-tab coordination if the browser has Web Locks', async () => {
      const navigator = { locks: new InTabLockManager() } as unknown as Navigator

      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({ navigator }))

      expect(sut.coordination).toBeInstanceOf(DefaultTabCoordination)
      expect(sut.coordination.isCrossTab).toBe(true)
    })

    test('should report no cross-tab coordination without Web Locks', async () => {
      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      expect(sut.coordination.isCrossTab).toBe(false)
    })
  })

  describe('#permission', () => {
    test('should report every permission as unsupported outside a browser', async () => {
      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      expect(sut.permission).toBeInstanceOf(DefaultPermissionManager)
      expect(await sut.permission.query('camera')).toBe('unsupported')
      expect(await sut.permission.query('microphone')).toBe('unsupported')
      expect(await sut.permission.query('geolocation')).toBe('unsupported')
      expect(await sut.permission.query('persistent-storage')).toBe('unsupported')
      expect(await sut.permission.query('clipboard-read')).toBe('unsupported')
      expect(await sut.permission.query('screen-wake-lock')).toBe('unsupported')
    })

    test('should request the camera for both facings and the microphone, each under its lock', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDeviceButler.create({}, browser.openEnvironment())

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
    const torchCamera = { require: { facing: 'back', torch: true }, prefer: { width: 1920, height: 1080 } } as const

    test('should be configured with the camera section', async () => {
      const sut = DefaultDeviceButler.create({ camera: torchCamera }, BrowserEnvironment.of({}))

      expect(sut.camera).toBeInstanceOf(DefaultCameraManager)
      expect(sut.camera.configuration).toEqual(torchCamera)
    })

    test('should open the configured camera', async () => {
      const browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
      using sut = DefaultDeviceButler.create({ camera: torchCamera }, browser.openEnvironment())

      await using session = await sut.camera.open()

      expect(session.descriptor.id).toBe('back-main')
      expect(session.torch).toBeDefined()
      expect(browser.devices.violations).toEqual([])
    })

    test('should request the permission for the configured facing only', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDeviceButler.create({ camera: { require: { facing: 'front' } } }, browser.openEnvironment())

      expect(await sut.permission.request('camera')).toBe('granted')

      expect(browser.devices.requests).toEqual([{ video: { facingMode: { exact: 'user' } } }])
    })

    test('should follow a configuration that is changed later', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDeviceButler.create({ camera: { require: { facing: 'front' } } }, browser.openEnvironment())
      sut.camera.configure({ require: { facing: 'back' } })

      await sut.permission.request('camera')

      expect(browser.devices.requests).toEqual([{ video: { facingMode: { exact: 'environment' } } }])
    })

    test('should close its sessions when the butler is disposed', async () => {
      const browser = new FakeMediaBrowser()
      const sut = DefaultDeviceButler.create({}, browser.openEnvironment())
      const session = await sut.camera.open({ require: { facing: 'back' } })

      sut.dispose()
      await new Promise((resolve) => setTimeout(resolve))

      expect(session.state).toBe('ended')
      expect(browser.devices.liveTracks).toEqual([])
    })
  })

  describe('#prepare', () => {
    const torchCamera = { require: { facing: 'back', torch: true }, prefer: { width: 1920, height: 1080 } } as const

    test('should prepare the camera and report what it found', async () => {
      const browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
      using sut = DefaultDeviceButler.create({ camera: torchCamera }, browser.openEnvironment())

      const result = await sut.prepare()

      expect(result.camera?.permission).toBe('granted')
      expect(result.camera?.selected?.id).toBe('back-main')
      expect(result.camera?.isResolutionAvailable).toBe(true)
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should not ask for a microphone the application did not configure', async () => {
      const browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
      using sut = DefaultDeviceButler.create({ camera: torchCamera }, browser.openEnvironment())

      const result = await sut.prepare()

      expect(result.microphone).toBeUndefined()
      expect(JSON.stringify(browser.devices.requests)).not.toContain('audio')
    })

    test('should only prepare the microphone if only the microphone is configured', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDeviceButler.create({ microphone: {} }, browser.openEnvironment())

      const result = await sut.prepare()

      expect(result.camera).toBeUndefined()
      expect(result.microphone?.permission).toBe('granted')
    })

    test('should let the call override the configuration', async () => {
      const browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
      using sut = DefaultDeviceButler.create({ camera: torchCamera }, browser.openEnvironment())

      const result = await sut.prepare({ camera: { require: { facing: 'front' } } })

      expect(result.camera?.selected?.facing).toBe('front')
    })

    test('should only prepare what was asked for', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDeviceButler.create({}, browser.openEnvironment())

      expect(await sut.prepare({})).toEqual({})
      expect(await sut.prepare({ camera: false })).toEqual({})
      expect(browser.devices.calls).toEqual([])
    })

    test('should say which backend the configured storage is kept in', async () => {
      using sut = DefaultDeviceButler.create(
        { storage: { require: { persistence: 'page' } } },
        BrowserEnvironment.of({})
      )

      const result = await sut.prepare()

      expect(result.storage?.capabilities?.driver).toBe('memory')
      expect(result.storage?.isPersistent).toBe(false)
    })

    test('should report a storage that no backend fits instead of throwing', async () => {
      using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      const result = await sut.prepare({ storage: { require: { persistence: 'origin' } } })

      expect(result.storage?.capabilities).toBeUndefined()
      expect(result.storage?.error?.name).toBe('StorageUnsupportedError')
    })

    test('should request the permission for the location if a location is configured', async () => {
      const geolocation = new FakeGeolocation()
      const globals: object = { navigator: { geolocation } }
      using sut = DefaultDeviceButler.create({ location: { highAccuracy: true } }, BrowserEnvironment.of(globals))

      const preparing = sut.prepare()
      await new Promise<void>((resolve) => setTimeout(resolve))
      geolocation.moveTo({ latitude: 52.52, longitude: 13.405 })

      expect((await preparing).location).toEqual({ permission: 'granted' })
    })

    test('should say that there is no location where the browser has none', async () => {
      using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      expect((await sut.prepare({ location: true })).location).toEqual({ permission: 'unsupported' })
    })

    test('should not prepare the storage and the location of an application that configured neither', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDeviceButler.create({ microphone: {} }, browser.openEnvironment())

      const result = await sut.prepare()

      expect(result.storage).toBeUndefined()
      expect(result.location).toBeUndefined()
    })

    test('should report instead of throwing where there are no cameras', async () => {
      using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      const result = await sut.prepare({ camera: true })

      expect(result.camera?.permission).toBe('unsupported')
      expect(result.camera?.error?.name).toBe('UnsupportedError')
    })
  })

  describe('#microphone', () => {
    test('should be configured with the microphone section', async () => {
      const sut = DefaultDeviceButler.create(
        { microphone: { prefer: { noiseSuppression: false } } },
        BrowserEnvironment.of({})
      )

      expect(sut.microphone).toBeInstanceOf(DefaultMicrophoneManager)
      expect(sut.microphone.configuration).toEqual({ prefer: { noiseSuppression: false } })
    })

    test('should open the configured microphone next to a camera', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDeviceButler.create({}, browser.openEnvironment())

      await using camera = await sut.camera.open({ require: { facing: 'back' } })
      await using microphone = await sut.microphone.open()

      expect(camera.state).toBe('live')
      expect(microphone.track.kind).toBe('audio')
      expect(browser.devices.violations).toEqual([])
    })

    test('should prepare the camera and the microphone with prepare()', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDeviceButler.create({}, browser.openEnvironment())

      const result = await sut.prepare()

      expect(result.camera?.permission).toBe('granted')
      expect(result.microphone?.permission).toBe('granted')
      expect(result.microphone?.selected?.id).toBe('microphone-0')
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should report a refused microphone and still prepare the camera', async () => {
      const browser = new FakeMediaBrowser()
      browser.devices.permission.microphone = 'denied'
      using sut = DefaultDeviceButler.create({}, browser.openEnvironment())

      const result = await sut.prepare({ camera: { require: { facing: 'back' } }, microphone: true })

      expect(result.camera?.selected).toBeDefined()
      expect(result.microphone?.permission).toBe('denied')
      expect(result.microphone?.error?.name).toBe('PermissionDeniedError')
    })
  })

  describe('#media', () => {
    test('should open a camera and a microphone together', async () => {
      const browser = new FakeMediaBrowser()
      using sut = DefaultDeviceButler.create({}, browser.openEnvironment())

      await using session = await sut.media.open({ camera: { require: { facing: 'back' } } })

      expect(sut.media).toBeInstanceOf(DefaultMediaManager)
      expect(session.stream.getTracks()).toHaveLength(2)
    })
  })

  describe('#location with a configuration', () => {
    test('should use the location section as the defaults of every call', async () => {
      const geolocation = new FakeGeolocation()
      const globals: object = { navigator: { geolocation } }

      using sut = DefaultDeviceButler.create(
        { location: { require: { accuracy: 50 } } },
        BrowserEnvironment.of(globals)
      )

      const locating = sut.location.current()
      geolocation.moveTo({ latitude: 52.52, longitude: 13.405, accuracy: 900 })
      geolocation.moveTo({ latitude: 52.52, longitude: 13.405, accuracy: 12 })

      expect((await locating).accuracy).toBe(12)
    })
  })

  describe('#location', () => {
    test('should determine where the device is', async () => {
      const geolocation = new FakeGeolocation()

      using sut = DefaultDeviceButler.create(
        {},
        BrowserEnvironment.of({ navigator: { geolocation } as unknown as Navigator })
      )

      const locating = sut.location.current()
      geolocation.moveTo({ latitude: 52.52, longitude: 13.405 })

      expect(sut.location).toBeInstanceOf(DefaultDeviceLocation)
      expect(await locating).toMatchObject({ latitude: 52.52, longitude: 13.405 })
    })

    test('should stop the watches when the butler is disposed', async () => {
      const geolocation = new FakeGeolocation()

      const sut = DefaultDeviceButler.create(
        {},
        BrowserEnvironment.of({ navigator: { geolocation } as unknown as Navigator })
      )

      const watch = sut.location.watch()

      sut.dispose()

      expect(watch.isActive).toBe(false)
    })
  })

  describe('#orientation', () => {
    test('should tell how the device is held', async () => {
      const window = { matchMedia: () => ({ matches: false }) } as unknown as Window
      using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({ window, document: {} as Document }))

      expect(sut.orientation).toBeInstanceOf(DefaultDeviceOrientation)
      expect(sut.orientation.current).toBe('landscape')
    })
  })

  describe('#notifications and #vibration', () => {
    test('should show notifications and vibrate where the browser can', async () => {
      FakeNotification.reset()
      const vibrate = vi.fn(() => true)
      const navigator = { vibrate } as unknown as Navigator

      using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({ Notification: FakeNotification, navigator }))

      expect(sut.notifications).toBeInstanceOf(DefaultDeviceNotifications)
      expect(sut.vibration).toBeInstanceOf(DefaultDeviceVibration)
      expect(await sut.permission.query('notifications')).toBe('granted')
      expect(await sut.notifications.show({ title: 'Report sent', tag: 'outbox' })).toBeDefined()
      expect(sut.vibration.vibrate('success')).toBe(true)
    })

    test('should support neither where the browser has neither', async () => {
      using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      expect(sut.notifications.isSupported).toBe(false)
      expect(sut.vibration.isSupported).toBe(false)
      expect(await sut.permission.request('notifications')).toBe('unsupported')
    })
  })

  describe('#motion', () => {
    const sensors = (requestPermission?: () => Promise<'granted' | 'denied'>) => ({
      window: new FakeEventTarget() as unknown as Window,
      document: {} as Document,
      DeviceOrientationEvent: { prototype: {}, requestPermission },
      DeviceMotionEvent: { prototype: {}, requestPermission },
    })

    test('should follow the sensors, and stop when the butler is disposed', async () => {
      const globals = sensors()
      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of(globals))

      const watch = sut.motion.watchAttitude()

      ;(globals.window as unknown as FakeEventTarget).dispatch('deviceorientation', { alpha: 0, beta: 10, gamma: 0 })

      expect(sut.motion).toBeInstanceOf(DefaultDeviceMotion)
      expect(watch.current?.pitch).toBeCloseTo(10)

      await sut.dispose()

      expect(watch.isActive).toBe(false)
    })

    test('should request the permission to read the sensors in prepare(), as Safari asks for it', async () => {
      const requestPermission = vi.fn(async () => 'granted' as const)
      using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of(sensors(requestPermission)))

      expect(await sut.prepare({ motion: true })).toEqual({ motion: { permission: 'granted' } })
      expect(requestPermission).toHaveBeenCalledTimes(2)
    })

    test('should report the sensors as unsupported where the browser has none', async () => {
      using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      expect(await sut.prepare({ motion: true })).toEqual({ motion: { permission: 'unsupported' } })
      expect(sut.motion.isSupported).toBe(false)
    })
  })

  describe('#scanner', () => {
    test('should read codes with the decoder of the configuration, or not at all', async () => {
      const decoder = { name: 'test', formats: async () => ['qr_code'] as const, decode: async () => [] }

      const sut = DefaultDeviceButler.create({ scanner: { decoder } }, BrowserEnvironment.of({}))
      const without = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      expect(sut.scanner).toBeInstanceOf(DefaultCodeScanner)
      expect(sut.scanner.isSupported).toBe(true)
      expect(await sut.scanner.formats()).toEqual(['qr_code'])
      expect(without.scanner.isSupported).toBe(false)
    })

    test('should stop its scans when the butler is disposed', async () => {
      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({ BarcodeDetector: FakeBarcodeDetector }))
      const scan = sut.scanner.scan(new FakeRecordingSource())

      await sut.dispose()
      await new Promise((resolve) => setTimeout(resolve))

      expect(scan.state).toBe('ended')
    })
  })

  describe('#screenCapture', () => {
    test('should capture the screen with the configured defaults', async () => {
      const browser = new FakeMediaBrowser()

      using sut = DefaultDeviceButler.create(
        { screenCapture: { prefer: { surface: 'window' } } },
        browser.openEnvironment()
      )

      await using _session = await sut.screenCapture.open()

      expect(sut.screenCapture).toBeInstanceOf(DefaultScreenCaptureManager)
      expect(browser.devices.displayRequests).toEqual([{ video: { displaySurface: 'window' } }])
    })

    test('should not be supported where the browser has nothing for it', () => {
      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      expect(sut.screenCapture.isSupported).toBe(false)
    })

    test('should stop its captures when the butler is disposed', async () => {
      const browser = new FakeMediaBrowser()
      const sut = DefaultDeviceButler.create({}, browser.openEnvironment())
      const session = await sut.screenCapture.open()

      await sut.dispose()

      expect(session.state).toBe('ended')
      expect(browser.devices.liveTracks).toEqual([])
    })
  })

  describe('the parts around the screen, the network and sharing', () => {
    test('should have every part, each working where the browser has nothing for it', async () => {
      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

      expect(sut.recorder).toBeInstanceOf(DefaultMediaRecordingManager)
      expect(sut.recorder.isSupported).toBe(false)
      expect(sut.audioOutput).toBeInstanceOf(DefaultAudioOutputManager)
      expect(await sut.audioOutput.list()).toEqual([])
      expect(sut.network).toBeInstanceOf(DefaultDeviceNetwork)
      expect(sut.network.isOnline).toBeUndefined()
      expect(sut.wakeLock).toBeInstanceOf(DefaultScreenWakeLock)
      expect(sut.wakeLock.isSupported).toBe(false)
      expect(sut.fullscreen).toBeInstanceOf(DefaultScreenFullscreen)
      expect(sut.fullscreen.isSupported).toBe(false)
      expect(sut.share).toBeInstanceOf(DefaultDeviceShare)
      expect(sut.share.isSupported).toBe(false)
      expect(sut.clipboard).toBeInstanceOf(DefaultDeviceClipboard)
      expect(sut.clipboard.isSupported).toBe(false)
      expect(sut.files).toBeInstanceOf(DefaultDeviceFiles)
      expect(sut.files.canChooseWhereToSave).toBe(false)
      expect(sut.page).toBeInstanceOf(DefaultPageLifecycle)
      expect(sut.page.state).toBeUndefined()
      expect(sut.outbox).toBeInstanceOf(DefaultOutboxManager)
    })

    test('should send what an outbox is given, and stop when the butler is disposed', async () => {
      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))
      const sent: string[] = []
      const outbox = await sut.outbox.open<string>({ namespace: 'uploads', send: async (item) => void sent.push(item) })

      await outbox.add('first')
      await outbox.flush()
      expect(sent).toEqual(['first'])

      await sut.dispose()
      await outbox.add('second')
      await outbox.flush()

      expect(sent).toEqual(['first'])
    })

    test('should tell whether the device has a network', async () => {
      const navigator = { onLine: false } as Navigator

      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({ navigator }))

      expect(sut.network.isOnline).toBe(false)
    })

    test('should keep a recording in its own storage', async () => {
      FakeMediaRecorder.reset()
      const MediaRecorder = FakeMediaRecorder as unknown as BrowserGlobals['MediaRecorder']
      using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({ MediaRecorder, Blob }))

      const recording = await sut.recorder.record(new FakeRecordingSource('audio'), { keep: { namespace: 'memos' } })
      FakeMediaRecorder.last.deliver('kept ')
      await new Promise((resolve) => setTimeout(resolve))

      const [kept] = await sut.recorder.kept('memos').list()
      expect(kept?.id).toBe(recording.id)
      expect(kept?.state).toBe('recording')
      expect(await (await recording.stop()).blob?.text()).toBe('kept end')
    })

    test('should let the screen sleep again when the butler is disposed', async () => {
      const release = vi.fn(async () => undefined)
      const sentinel = { addEventListener: () => undefined, release }
      const navigator = { wakeLock: { request: async () => sentinel } } as unknown as Navigator
      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({ navigator }))
      const hold = await sut.wakeLock.request()

      await sut.dispose()

      expect(hold.isReleased).toBe(true)
      expect(release).toHaveBeenCalledOnce()
    })
  })

  describe('#platform', () => {
    test('should tell the platform of the device', async () => {
      const navigator = { platform: 'iPhone' } as Navigator

      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({ navigator }))

      expect(sut.platform).toBeInstanceOf(DefaultDevicePlatform)
      expect(sut.platform.isIos).toBe(true)
    })
  })

  describe('#dispose', () => {
    test('should be callable on a butler that was never used, any number of times', async () => {
      const BroadcastChannel = vi.fn(InTabBroadcastChannel)
      const sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({ BroadcastChannel }))

      sut.dispose()
      sut.dispose()

      expect(BroadcastChannel).not.toHaveBeenCalled()
    })

    test('should be disposed at the end of a using block', async () => {
      const dispose = vi.spyOn(DefaultDeviceButler.prototype, 'dispose')

      {
        using sut = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))
        expect(sut).toBeInstanceOf(DefaultDeviceButler)
      }

      expect(dispose).toHaveBeenCalledTimes(1)
      dispose.mockRestore()
    })

    test('should resolve once the camera is free for the other tabs', async () => {
      const browser = new FakeMediaBrowser()
      const sut = DefaultDeviceButler.create({}, browser.openEnvironment())
      using other = DefaultDeviceButler.create({}, browser.openEnvironment())
      await sut.camera.open({ require: { facing: 'back' } })

      await sut.dispose()

      expect((await browser.locks.query()).held).toEqual([])
      await using session = await other.camera.open({ require: { facing: 'back' } })
      expect(session.state).toBe('live')
    })

    test('should be disposed at the end of an await using block', async () => {
      const browser = new FakeMediaBrowser()
      {
        await using sut = DefaultDeviceButler.create({}, browser.openEnvironment())
        await sut.camera.open({ require: { facing: 'back' } })
      }

      expect(browser.devices.liveTracks).toEqual([])
      expect((await browser.locks.query()).held).toEqual([])
    })

    test('should not open a camera or a microphone any more', async () => {
      const browser = new FakeMediaBrowser()
      const sut = DefaultDeviceButler.create({}, browser.openEnvironment())

      await sut.dispose()

      await expect(sut.camera.open()).rejects.toThrow(MediaError)
      await expect(sut.microphone.open()).rejects.toThrow(/disposed/)
      expect(browser.devices.calls).toEqual([])
    })
  })
})
