import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceBusyError } from '../errors/media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import { FakeMediaBrowser } from '../testing/fake-media-browser.ts'
import { FakeMediaDevices } from '../testing/fake-media-devices.ts'
import { TestInputDescriptor } from '../testing/input/test-input-descriptor.ts'
import { TestInputManager } from '../testing/input/test-input-manager.ts'
import { TestMediaSession } from '../testing/input/test-media-session.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

describe('base-media-input-manager', () => {
  let browser!: FakeMediaBrowser
  let sut!: TestInputManager

  const isLocked = async () =>
    (await browser.locks.query()).held?.some((lock) => lock.name === 'web-device-butler:camera') ?? false

  beforeEach(() => {
    browser = new FakeMediaBrowser()
    sut = new TestInputManager(browser.openTab().access)
  })

  afterEach(() => {
    sut.dispose()
    browser.close()
    browser.devices.assertNoViolations()
  })

  describe('#configuration', () => {
    test('should start with what the manager was created with', async () => {
      const manager = new TestInputManager(browser.openTab().access, { facing: 'back', whenBusy: 'wait' })

      expect(manager.configuration).toEqual({ facing: 'back', whenBusy: 'wait' })
    })

    test('should replace single fields', async () => {
      const manager = new TestInputManager(browser.openTab().access, { facing: 'back', whenBusy: 'wait' })

      manager.configure({ facing: 'front' })

      expect(manager.configuration).toEqual({ facing: 'front', whenBusy: 'wait' })
    })

    test('should keep a field that a change does not set', async () => {
      const manager = new TestInputManager(browser.openTab().access, { facing: 'back' })

      manager.configure({ facing: undefined, whenBusy: 'takeover' })

      expect(manager.configuration).toEqual({ facing: 'back', whenBusy: 'takeover' })
    })

    test('should not keep a signal, it belongs to a single call', async () => {
      const signal = new AbortController().signal
      const manager = new TestInputManager(browser.openTab().access, { signal })

      manager.configure({ signal })

      expect(manager.configuration).toEqual({})
    })

    test('should not change the object it was given', async () => {
      const configuration = { facing: 'back' as const }
      const manager = new TestInputManager(browser.openTab().access, configuration)

      manager.configure({ facing: 'front' })

      expect(configuration).toEqual({ facing: 'back' })
    })
  })

  describe('#list', () => {
    test('should list nothing and ask the browser nothing before access was requested', async () => {
      expect(await sut.list()).toEqual([])
      expect(sut.access.back).toBe('locked')
      expect(browser.devices.calls).toEqual([])
    })

    test('should describe the devices once access was requested', async () => {
      await sut.requestAccess({ facing: 'back' })

      const cameras = await sut.list()

      expect(cameras.every((camera) => camera instanceof TestInputDescriptor)).toBe(true)
      expect(cameras.map(({ id, facing, detail }) => ({ id, facing, detail }))).toEqual([
        { id: 'front-0', facing: 'front', detail: 'listed' },
        { id: 'front-1', facing: 'front', detail: 'listed' },
        { id: 'back-0', facing: 'back', detail: 'listed' },
        { id: 'back-1', facing: 'back', detail: 'listed' },
      ])
    })

    test('should never start a device', async () => {
      await sut.requestAccess()
      const requests = browser.devices.requests.length

      await sut.list()

      expect(browser.devices.requests).toHaveLength(requests)
    })
  })

  describe('#requestAccess', () => {
    test('should request the facing that is asked for', async () => {
      const state = await sut.requestAccess({ facing: 'front' })

      expect(state.front).toBe('granted')
      expect(state.back).toBe('locked')
      expect(sut.access).toBe(state)
    })

    test('should request both facings where none is asked for, the back first', async () => {
      await sut.requestAccess()

      expect(browser.devices.requests).toEqual([
        { video: { facingMode: { exact: 'environment' } } },
        { video: { facingMode: { exact: 'user' } } },
      ])
    })

    test('should request the configured facing by default', async () => {
      sut.configure({ facing: 'back' })

      await sut.requestAccess()

      expect(browser.devices.requests).toHaveLength(1)
      expect(sut.access.front).toBe('locked')
    })

    test('should report a refusal through the state', async () => {
      browser.devices.permission.camera = 'denied'

      const state = await sut.requestAccess({ facing: 'back' })

      expect(state.back).toBe('denied')
    })

    test('should announce the change', async () => {
      const listener = vi.fn()
      sut.on('accesschange', listener)

      await sut.requestAccess({ facing: 'back' })

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(sut.access)
    })
  })

  describe('#select', () => {
    test('should request access and return the device that fits', async () => {
      const camera = await sut.select({ facing: 'back' })

      expect(camera?.id).toBe('back-0')
      expect(sut.access.back).toBe('granted')
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should use the configured requirements', async () => {
      sut.configure({ facing: 'front' })

      expect((await sut.select())?.id).toBe('front-0')
    })

    test('should return nothing if no device fits', async () => {
      const backOnly = new FakeMediaBrowser({ inputs: FakeMediaDevices.desktop() })
      const manager = new TestInputManager(backOnly.openTab().access)

      expect(await manager.select({ facing: 'front' })).toBeUndefined()
    })

    test('should return nothing after a refusal', async () => {
      browser.devices.permission.camera = 'denied'

      expect(await sut.select({ facing: 'back' })).toBeUndefined()
      expect(sut.access.back).toBe('denied')
    })

    test('should fail if another tab holds the camera and access is still missing', async () => {
      await browser.openTab().access.acquire()

      await expect(sut.select({ facing: 'back' })).rejects.toBeInstanceOf(MediaDeviceBusyError)
    })

    test('should not need the camera once access was granted', async () => {
      await sut.requestAccess({ facing: 'back' })
      await browser.openTab().access.acquire()

      expect((await sut.select({ facing: 'back' }))?.id).toBe('back-0')
    })
  })

  describe('#open', () => {
    test('should open the device that fits, by its id', async () => {
      await using session = await sut.open({ facing: 'back' })

      expect(session).toBeInstanceOf(TestMediaSession)
      expect(session.state).toBe('live')
      expect(session.track.label).toBe('camera2 0, facing back')
      expect(browser.devices.requests).toEqual([
        { video: { facingMode: { exact: 'environment' } } },
        { video: { deviceId: { exact: 'back-0' } } },
      ])
    })

    test('should use the configured requirements', async () => {
      sut.configure({ facing: 'front' })

      await using session = await sut.open()

      expect(session.track.label).toBe('camera2 1, facing front')
    })

    test('should let a call override single fields of the configuration', async () => {
      sut.configure({ facing: 'front', constraints: { width: { ideal: 1280 } } })

      await using session = await sut.open({ facing: 'back' })

      expect(session.track.label).toBe('camera2 0, facing back')
      expect(browser.devices.requests.at(-1)).toEqual({
        video: { width: { ideal: 1280 }, deviceId: { exact: 'back-0' } },
      })
      expect(sut.configuration.facing).toBe('front')
    })

    test('should open a device by its id', async () => {
      await using session = await sut.open({ id: 'back-1' })

      expect(session.track.label).toBe('camera2 2, facing back')
    })

    test('should fail for an id that does not exist', async () => {
      await expect(sut.open({ id: 'gone' })).rejects.toBeInstanceOf(MediaDeviceNotFoundError)

      expect(await isLocked()).toBe(false)
      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should fail if no device fits', async () => {
      const desktop = new FakeMediaBrowser({ inputs: FakeMediaDevices.desktop() })
      const manager = new TestInputManager(desktop.openTab().access)

      await expect(manager.open({ facing: 'front' })).rejects.toBeInstanceOf(MediaRequirementsError)

      expect(desktop.devices.liveTracks).toEqual([])
    })

    test('should open a webcam, which has no facing', async () => {
      const desktop = new FakeMediaBrowser({ inputs: FakeMediaDevices.desktop() })
      const manager = new TestInputManager(desktop.openTab().access)

      await using session = await manager.open()

      expect(session.track.label).toBe('HD Webcam')
      expect(desktop.devices.violations).toEqual([])
    })

    test('should fail after a refusal', async () => {
      browser.devices.permission.camera = 'denied'

      await expect(sut.open({ facing: 'back' })).rejects.toBeInstanceOf(PermissionDeniedError)

      expect(await isLocked()).toBe(false)
    })

    test('should hold the camera until the session is closed', async () => {
      const session = await sut.open({ facing: 'back' })
      expect(await isLocked()).toBe(true)
      expect(sut.availability).toBe('held-by-this-tab')

      await session.close()

      expect(await isLocked()).toBe(false)
    })

    test('should allow one camera session at a time', async () => {
      await using session = await sut.open({ facing: 'back' })

      const error = await sut.open({ facing: 'front' }).catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(MediaDeviceBusyError)
      expect((error as MediaDeviceBusyError).holder).toBe('this-tab')
      expect(session.state).toBe('live')
    })

    test('should open again once the session was closed', async () => {
      await (await sut.open({ facing: 'back' })).close()

      await using session = await sut.open({ facing: 'front' })

      expect(session.state).toBe('live')
    })

    test('should fail by default if another tab holds the camera', async () => {
      const other = new TestInputManager(browser.openTab().access)
      await using session = await other.open({ facing: 'back' })

      const error = await sut.open({ facing: 'back' }).catch((reason: unknown) => reason)

      expect((error as MediaDeviceBusyError).holder).toBe('other-tab')
      expect(session.state).toBe('live')
    })

    test('should wait for the other tab if asked to', async () => {
      const other = new TestInputManager(browser.openTab().access)
      const first = await other.open({ facing: 'back' })

      const opening = sut.open({ facing: 'back', whenBusy: 'wait' })
      await flush()
      await first.close()

      await using session = await opening
      expect(session.state).toBe('live')
    })

    test('should stop waiting when the signal aborts', async () => {
      const other = new TestInputManager(browser.openTab().access)
      await using _session = await other.open({ facing: 'back' })
      const controller = new AbortController()
      const reason = new Error('the user left')

      const opening = sut.open({ whenBusy: 'wait', signal: controller.signal })
      controller.abort(reason)

      await expect(opening).rejects.toBe(reason)
    })

    test('should take the camera over from the other tab if asked to', async () => {
      const other = new TestInputManager(browser.openTab().access)
      const first = await other.open({ facing: 'back' })
      const ended = vi.fn()
      first.on('ended', ended)

      await using session = await sut.open({ facing: 'back', whenBusy: 'takeover' })

      expect(session.state).toBe('live')
      expect(first.state).toBe('ended')
      expect(ended).toHaveBeenCalledWith({ reason: 'taken-over' })
    })

    test('should use the configured busy policy', async () => {
      const other = new TestInputManager(browser.openTab().access)
      const first = await other.open({ facing: 'back' })
      sut.configure({ whenBusy: 'takeover' })

      await using session = await sut.open({ facing: 'back' })

      expect(session.state).toBe('live')
      expect(first.state).toBe('ended')
    })
  })

  describe('events', () => {
    test('should announce the new list when a device is plugged in', async () => {
      await sut.requestAccess({ facing: 'back' })
      const listener = vi.fn<(cameras: readonly TestInputDescriptor[]) => void>()
      sut.on('change', listener)

      browser.devices.plug({ deviceId: 'usb-0', kind: 'videoinput', label: 'USB camera' })
      await flush()

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener.mock.calls[0]?.[0].map((camera) => camera.id)).toContain('usb-0')
    })

    test('should not list the devices for a change before access was requested', async () => {
      const listener = vi.fn()
      sut.on('change', listener)

      browser.devices.plug({ deviceId: 'usb-0', kind: 'videoinput', label: 'USB camera' })
      await flush()

      expect(listener).toHaveBeenCalledWith([])
      expect(browser.devices.calls).toEqual([])
    })

    test('should only listen to the browser while someone listens', async () => {
      const subscription = sut.on('change', () => undefined)
      expect(browser.devices.listenerCount).toBe(1)

      subscription.unsubscribe()

      expect(browser.devices.listenerCount).toBe(0)
    })

    test('should announce when the camera is taken and freed', async () => {
      const listener = vi.fn()
      sut.on('availabilitychange', listener)

      await (await sut.open({ facing: 'back' })).close()
      await flush()

      expect(listener.mock.calls).toEqual([['held-by-this-tab'], ['free']])
    })

    test('should announce when another tab takes the camera', async () => {
      const listener = vi.fn()
      sut.on('availabilitychange', listener)
      await flush()

      await browser.openTab().access.acquire()
      await flush()

      expect(listener).toHaveBeenCalledWith('held-by-other-tab')
      expect(sut.availability).toBe('held-by-other-tab')
    })
  })

  describe('#dispose', () => {
    test('should close every session', async () => {
      const session = await sut.open({ facing: 'back' })

      sut.dispose()
      await flush()

      expect(session.state).toBe('ended')
      expect(browser.devices.liveTracks).toEqual([])
      expect(await isLocked()).toBe(false)
    })

    test('should stop listening', async () => {
      sut.on('change', () => undefined)

      sut.dispose()

      expect(browser.devices.listenerCount).toBe(0)
    })

    test('should be disposed at the end of a using block', async () => {
      let session: TestMediaSession
      {
        using manager = new TestInputManager(browser.openTab().access)
        session = await manager.open({ facing: 'back' })
      }

      expect(session.state).toBe('ended')
    })
  })
})
