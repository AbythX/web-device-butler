import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import type { Logger } from '../core/logging/logger.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import { MediaPermissionRequester } from '../media/access/media-permission-requester.ts'
import { MediaDeviceBusyError } from '../media/errors/media-device-busy-error.ts'
import { FakeMediaBrowser } from '../media/testing/fake-media-browser.ts'
import { DefaultPermissionManager } from './default-permission-manager.ts'
import type { PermissionManager } from './permission-manager.ts'
import type { DevicePermissionChange, DevicePermissionName, DevicePermissionState } from './permission-state.ts'
import { GeolocationPermissionRequester } from './requesters/geolocation-permission-requester.ts'
import type { PermissionRequester } from './requesters/permission-requester.ts'
import { PersistentStoragePermissionRequester } from './requesters/persistent-storage-permission-requester.ts'
import { FakePermissions } from './testing/fake-permissions.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

class StubRequester implements PermissionRequester {
  public isSupported = true
  public readonly request = vi.fn<PermissionRequester['request']>(async () => undefined)
  public known: DevicePermissionState | undefined

  public async query(): Promise<DevicePermissionState | undefined> {
    return this.known
  }
}

describe('default-permission-manager', () => {
  let permissions!: FakePermissions
  let requesters!: Record<DevicePermissionName, StubRequester>
  let sut!: PermissionManager

  const createSut = (browserPermissions: FakePermissions = permissions, logger: Logger = new NullLogger()) =>
    new DefaultPermissionManager(
      BrowserEnvironment.of({ navigator: { permissions: browserPermissions } as unknown as Navigator }),
      requesters,
      logger
    )

  beforeEach(() => {
    permissions = new FakePermissions()
    requesters = {
      camera: new StubRequester(),
      microphone: new StubRequester(),
      geolocation: new StubRequester(),
      'persistent-storage': new StubRequester(),
      'clipboard-read': new StubRequester(),
      'screen-wake-lock': new StubRequester(),
      motion: new StubRequester(),
    }
    sut = createSut()
  })

  afterEach(() => {
    sut.dispose()
  })

  describe('#query', () => {
    test.each(['granted', 'denied', 'prompt'] as const)('should report what the browser says: %s', async (state) => {
      permissions.set('camera', state)

      expect(await sut.query('camera')).toBe(state)
    })

    test('should not know the state where the browser has no Permissions API', async () => {
      sut = new DefaultPermissionManager(
        BrowserEnvironment.of({ navigator: {} as Navigator }),
        requesters,
        new NullLogger()
      )

      expect(await sut.query('camera')).toBe('unknown')
    })

    test('should not know the state of a permission the browser cannot be asked about', async () => {
      sut = createSut(new FakePermissions(['geolocation']))

      expect(await sut.query('camera')).toBe('unknown')
      expect(await sut.query('geolocation')).toBe('prompt')
    })

    test('should report up front what does not exist here', async () => {
      requesters.camera.isSupported = false
      permissions.set('camera', 'granted')

      expect(await sut.query('camera')).toBe('unsupported')
    })

    test('should use what is known otherwise where the browser cannot tell', async () => {
      sut = createSut(new FakePermissions([]))
      requesters.camera.known = 'granted'

      expect(await sut.query('camera')).toBe('granted')
    })

    test('should take a permission that was granted for this visit for granted', async () => {
      requesters.camera.known = 'granted'

      expect(await sut.query('camera')).toBe('granted')
    })

    test('should believe the browser when it says that the permission is denied', async () => {
      permissions.set('camera', 'denied')
      requesters.camera.known = 'granted'

      expect(await sut.query('camera')).toBe('denied')
    })

    test('should never reject', async () => {
      const logger = mock<Logger>()
      sut = createSut(new FakePermissions([]), logger)
      vi.spyOn(requesters.camera, 'query').mockRejectedValue(new Error('failed'))

      expect(await sut.query('camera')).toBe('unknown')
      expect(logger.debug).toHaveBeenCalledTimes(1)
    })
  })

  describe('#request', () => {
    test('should return the state the request ended with', async () => {
      requesters.camera.request.mockResolvedValue('granted')

      expect(await sut.request('camera')).toBe('granted')
    })

    test('should return a refusal as a state', async () => {
      requesters.camera.request.mockResolvedValue('denied')

      expect(await sut.request('camera')).toBe('denied')
    })

    test('should ask the browser where the request cannot tell', async () => {
      requesters.geolocation.request.mockImplementation(async () => {
        permissions.set('geolocation', 'granted')

        return undefined
      })

      expect(await sut.request('geolocation')).toBe('granted')
    })

    test('should pass the options on', async () => {
      await sut.request('camera', { facing: 'front' })

      expect(requesters.camera.request).toHaveBeenCalledWith({ facing: 'front' })
    })

    test('should not request what does not exist here', async () => {
      requesters.camera.isSupported = false

      expect(await sut.request('camera')).toBe('unsupported')
      expect(requesters.camera.request).not.toHaveBeenCalled()
    })

    test('should pass on a failure that is not a refusal', async () => {
      const error = new MediaDeviceBusyError('camera', 'other-tab')
      requesters.camera.request.mockRejectedValue(error)

      await expect(sut.request('camera')).rejects.toBe(error)
    })
  })

  describe('change', () => {
    const watch = async () => {
      const changes: DevicePermissionChange[] = []
      sut.on('change', (change) => changes.push(change))
      await flush()

      return changes
    }

    test('should announce a permission the user changes in the browser', async () => {
      const changes = await watch()

      permissions.set('camera', 'denied')
      await flush()

      expect(changes).toEqual([{ name: 'camera', state: 'denied' }])
    })

    test('should announce a permission that a request changed', async () => {
      const changes = await watch()
      requesters.microphone.request.mockResolvedValue('granted')

      await sut.request('microphone')

      expect(changes).toEqual([{ name: 'microphone', state: 'granted' }])
    })

    test('should not announce a state that did not change', async () => {
      const changes = await watch()

      await sut.query('camera')
      await sut.request('camera')

      expect(changes).toEqual([])
    })

    test('should not take the first state of a permission for a change', async () => {
      const changes: DevicePermissionChange[] = []
      sut = createSut(new FakePermissions([]))
      requesters.camera.request.mockResolvedValue('granted')
      sut.on('change', (change) => changes.push(change))

      await sut.request('camera')

      expect(changes).toEqual([])
    })

    test('should only listen to the browser while someone listens', async () => {
      const subscription = sut.on('change', () => undefined)
      await flush()
      expect(permissions.status('camera').listenerCount).toBe(1)

      subscription.unsubscribe()

      expect(permissions.status('camera').listenerCount).toBe(0)
      expect(permissions.status('geolocation').listenerCount).toBe(0)
    })

    test('should listen to the browser once if the listeners are gone and back before it has answered', async () => {
      sut.on('change', () => undefined).unsubscribe()
      sut.on('change', () => undefined)
      await flush()

      expect(permissions.status('camera').listenerCount).toBe(1)
      expect(permissions.status('geolocation').listenerCount).toBe(1)
    })

    test('should not start listening if the listener is gone before the browser has answered', async () => {
      sut.on('change', () => undefined).unsubscribe()
      await flush()

      expect(permissions.status('camera').listenerCount).toBe(0)
    })

    test('should stop listening when it is disposed', async () => {
      await watch()

      sut.dispose()

      expect(permissions.status('camera').listenerCount).toBe(0)
    })
  })

  describe('camera and microphone', () => {
    let browser!: FakeMediaBrowser

    const createMediaSut = () => {
      const camera = browser.openTab('camera').access
      const microphone = browser.openTab('microphone').access

      return new DefaultPermissionManager(
        browser.openEnvironment(),
        {
          ...requesters,
          camera: new MediaPermissionRequester(camera, ['back', 'front']),
          microphone: new MediaPermissionRequester(microphone, ['any']),
        },
        new NullLogger()
      )
    }

    beforeEach(() => {
      browser = new FakeMediaBrowser()
      sut = createMediaSut()
    })

    afterEach(() => {
      browser.close()
      browser.devices.assertNoViolations()
    })

    test('should request the camera through the access gate, for both facings', async () => {
      expect(await sut.request('camera')).toBe('granted')

      expect(browser.devices.requests).toEqual([
        { video: { facingMode: { exact: 'environment' } } },
        { video: { facingMode: { exact: 'user' } } },
      ])
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should request the camera for one facing', async () => {
      expect(await sut.request('camera', { facing: 'front' })).toBe('granted')

      expect(browser.devices.requests).toEqual([{ video: { facingMode: { exact: 'user' } } }])
    })

    test('should request the microphone', async () => {
      expect(await sut.request('microphone', { facing: 'front' })).toBe('granted')

      expect(browser.devices.requests).toEqual([{ audio: true }])
    })

    test('should return a refusal as a state', async () => {
      browser.devices.permission.camera = 'denied'

      expect(await sut.request('camera')).toBe('denied')
    })

    test('should not start a device again once access was granted', async () => {
      await sut.request('camera', { facing: 'back' })

      expect(await sut.request('camera', { facing: 'back' })).toBe('granted')
      expect(browser.devices.requests).toHaveLength(1)
    })

    test('should know the permission after the request, also where the browser cannot be asked', async () => {
      browser.permissions.set('camera', 'prompt')

      await sut.request('camera', { facing: 'back' })

      expect(await sut.query('camera')).toBe('granted')
    })

    test('should fail if another tab holds the camera', async () => {
      await browser.openTab().access.acquire()

      await expect(sut.request('camera')).rejects.toBeInstanceOf(MediaDeviceBusyError)
    })

    test('should report a page without media devices as unsupported', async () => {
      browser = new FakeMediaBrowser(undefined, { navigator: {} as Navigator })
      sut = createMediaSut()

      expect(await sut.query('camera')).toBe('unsupported')
      expect(await sut.request('microphone')).toBe('unsupported')
    })
  })

  describe('geolocation', () => {
    const createRequester = (getCurrentPosition?: Geolocation['getCurrentPosition']) =>
      new GeolocationPermissionRequester(
        BrowserEnvironment.of({
          navigator: (getCurrentPosition ? { geolocation: { getCurrentPosition } } : {}) as unknown as Navigator,
        })
      )

    test('should not be supported without geolocation', async () => {
      const requester = createRequester()

      expect(requester.isSupported).toBe(false)
      expect(await requester.request()).toBe('unsupported')
    })

    test('should not be supported on a page without a secure context', async () => {
      const getCurrentPosition = vi.fn()

      const requester = new GeolocationPermissionRequester(
        BrowserEnvironment.of({
          isSecureContext: false,
          navigator: { geolocation: { getCurrentPosition } } as unknown as Navigator,
        })
      )

      expect(requester.isSupported).toBe(false)
      expect(await requester.request()).toBe('unsupported')
      expect(getCurrentPosition).not.toHaveBeenCalled()
    })

    test('should limit how long the browser may look for the position', async () => {
      const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) =>
        success({} as GeolocationPosition)
      )

      await createRequester(getCurrentPosition).request()

      expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({ timeout: 10_000 })
    })

    test('should be granted once the browser delivers a position', async () => {
      const requester = createRequester((success) => success({} as GeolocationPosition))

      expect(requester.isSupported).toBe(true)
      expect(await requester.request()).toBe('granted')
    })

    test('should be denied if the browser says so', async () => {
      const requester = createRequester((_success, failure) => failure?.({ code: 1 } as GeolocationPositionError))

      expect(await requester.request()).toBe('denied')
    })

    test('should not take a position that could not be determined for a refusal', async () => {
      const requester = createRequester((_success, failure) => failure?.({ code: 2 } as GeolocationPositionError))

      expect(await requester.request()).toBeUndefined()
    })
  })

  describe('persistent storage', () => {
    const createRequester = (storage?: Partial<StorageManager>) =>
      new PersistentStoragePermissionRequester(
        BrowserEnvironment.of({ navigator: { storage } as unknown as Navigator })
      )

    test('should not be supported where the browser cannot keep data', async () => {
      expect(createRequester().isSupported).toBe(false)
      expect(createRequester({}).isSupported).toBe(false)
    })

    test('should be granted if the browser keeps the data', async () => {
      const requester = createRequester({ persist: async () => true, persisted: async () => true })

      expect(requester.isSupported).toBe(true)
      expect(await requester.request()).toBe('granted')
      expect(await requester.query()).toBe('granted')
    })

    test('should leave the answer to the browser if it does not keep the data', async () => {
      const requester = createRequester({ persist: async () => false, persisted: async () => false })

      expect(await requester.request()).toBeUndefined()
      expect(await requester.query()).toBeUndefined()
    })
  })
})
