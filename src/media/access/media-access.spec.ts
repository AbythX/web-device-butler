import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceBusyError } from '../errors/media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import { FakeMediaBrowser, type FakeMediaTab } from '../testing/fake-media-browser.ts'
import { FakeMediaDevices } from '../testing/fake-media-devices.ts'
import type { MediaAccess, MediaAvailability } from './media-access.ts'
import { MediaAccessState } from './media-access-state.ts'

const cameraLock = 'web-device-butler:camera'

const flush = (milliseconds = 0) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

describe('media-access', () => {
  let browser!: FakeMediaBrowser
  let tab!: FakeMediaTab
  let sut!: MediaAccess

  const isLocked = async () => (await browser.locks.query()).held?.some((lock) => lock.name === cameraLock) ?? false

  beforeEach(() => {
    browser = new FakeMediaBrowser()
    tab = browser.openTab()
    sut = tab.access
  })

  afterEach(() => {
    browser.close()
    browser.devices.assertNoViolations()
  })

  describe('#isSupported', () => {
    test('should be supported where the browser has media devices', async () => {
      expect(sut.isSupported).toBe(true)
    })

    test('should not be supported without media devices', async () => {
      const withoutDevices = new FakeMediaBrowser(undefined, { navigator: {} as Navigator })

      expect(withoutDevices.openTab().access.isSupported).toBe(false)
    })

    test('should not be supported on a page that is not secure', async () => {
      const insecure = new FakeMediaBrowser(undefined, { isSecureContext: false })

      expect(insecure.openTab().access.isSupported).toBe(false)
    })
  })

  describe('#state', () => {
    test('should start with no access at all', async () => {
      expect(sut.state).toBe(MediaAccessState.initial)
      expect(sut.state.front).toBe('locked')
      expect(sut.state.back).toBe('locked')
      expect(sut.state.any).toBe('locked')
    })

    test('should track access per facing', async () => {
      await sut.requestAccess(['back'])

      expect(sut.state.back).toBe('granted')
      expect(sut.state.front).toBe('locked')
      expect(sut.state.isGranted('back')).toBe(true)
      expect(sut.state.isGranted('front')).toBe(false)
    })

    test('should cover a device without a facing by access of any facing', async () => {
      await sut.requestAccess(['front'])

      expect(sut.state.any).toBe('locked')
      expect(sut.state.isGranted('any')).toBe(true)
    })

    test('should announce every change', async () => {
      const listener = vi.fn()
      sut.on('accesschange', listener)

      await sut.requestAccess(['back'])
      await sut.requestAccess(['back'])

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(sut.state)
    })

    test('should not fail the request if a listener fails', async () => {
      const logger = mock<Logger>()
      const access = browser.openTab('camera', 'exclusive', {}, logger).access
      access.on('accesschange', () => {
        throw new Error('listener failed')
      })

      const state = await access.requestAccess(['back'])

      expect(state.back).toBe('granted')
      expect(logger.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('#acquire', () => {
    test('should hold the lock of the camera until the lease is released', async () => {
      const lease = await sut.acquire()
      expect(await isLocked()).toBe(true)

      await lease.release()

      expect(lease.isReleased).toBe(true)
      expect(await isLocked()).toBe(false)
    })

    test('should release at the end of an await using block', async () => {
      {
        await using lease = await sut.acquire()
        expect(lease.isReleased).toBe(false)
      }

      expect(await isLocked()).toBe(false)
    })

    test('should fail where the browser has no media devices', async () => {
      const access = new FakeMediaBrowser(undefined, { navigator: {} as Navigator }).openTab().access

      await expect(access.acquire()).rejects.toBeInstanceOf(UnsupportedError)
    })

    test('should fail by default if another tab holds the camera', async () => {
      await browser.openTab().access.acquire()

      const error = await sut.acquire().catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(MediaDeviceBusyError)
      expect((error as MediaDeviceBusyError).holder).toBe('other-tab')
    })

    test('should tell if this tab holds the camera itself', async () => {
      await sut.acquire()

      const error = await sut.acquire({ whenBusy: 'fail' }).catch((reason: unknown) => reason)

      expect((error as MediaDeviceBusyError).holder).toBe('this-tab')
    })

    test('should let several tabs hold a microphone', async () => {
      const first = await browser.openTab('microphone').access.acquire()
      const second = await browser.openTab('microphone').access.acquire()

      expect(first.isReleased).toBe(false)
      expect(second.isReleased).toBe(false)
    })

    test('should keep a microphone to one tab if asked to', async () => {
      await browser.openTab('microphone').access.acquire({ mode: 'exclusive' })

      await expect(browser.openTab('microphone').access.acquire()).rejects.toBeInstanceOf(MediaDeviceBusyError)
    })

    test('should not mix up the camera and the microphone', async () => {
      await sut.acquire()

      await expect(browser.openTab('microphone').access.acquire({ mode: 'exclusive' })).resolves.toBeDefined()
    })

    describe('wait', () => {
      test('should wait until the other tab releases the camera', async () => {
        const holder = await browser.openTab().access.acquire()
        const settled = vi.fn()

        const waiting = sut.acquire({ whenBusy: 'wait' })
        void waiting.then(settled)
        await flush()
        expect(settled).not.toHaveBeenCalled()

        await holder.release()

        expect((await waiting).isReleased).toBe(false)
      })

      test('should stop waiting when the signal aborts', async () => {
        await browser.openTab().access.acquire()
        const controller = new AbortController()
        const reason = new Error('the user left')

        const waiting = sut.acquire({ whenBusy: 'wait', signal: controller.signal })
        controller.abort(reason)

        await expect(waiting).rejects.toBe(reason)
      })

      test('should not start with a signal that has aborted', async () => {
        const reason = new Error('too late')

        await expect(sut.acquire({ signal: AbortSignal.abort(reason) })).rejects.toBe(reason)
        expect(await isLocked()).toBe(false)
      })
    })

    describe('takeover', () => {
      test('should get the camera from a tab that gives it up', async () => {
        const holder = await browser.openTab().access.acquire()
        holder.onTakeover = async () => {
          await holder.release()

          return true
        }

        const lease = await sut.acquire({ whenBusy: 'takeover' })

        expect(holder.isReleased).toBe(true)
        expect(lease.isReleased).toBe(false)
      })

      test('should fail if the other tab keeps the camera', async () => {
        const holder = await browser.openTab().access.acquire()
        holder.onTakeover = async () => false

        const error = await sut.acquire({ whenBusy: 'takeover' }).catch((reason: unknown) => reason)

        expect(error).toBeInstanceOf(MediaDeviceBusyError)
        expect((error as MediaDeviceBusyError).holder).toBe('other-tab')
        expect(holder.isReleased).toBe(false)
      })

      test('should give up if nobody answers in time', async () => {
        await browser.openTab().access.acquire()

        await expect(sut.acquire({ whenBusy: 'takeover' })).rejects.toBeInstanceOf(MediaDeviceBusyError)
      })

      test('should get the camera if the holder finishes before the time is up', async () => {
        const holder = await browser.openTab().access.acquire()

        const taking = sut.acquire({ whenBusy: 'takeover' })
        await flush(5)
        await holder.release()

        expect((await taking).isReleased).toBe(false)
      })

      test('should take the camera over from a session of the same tab', async () => {
        const holder = await sut.acquire()
        holder.onTakeover = async () => {
          await holder.release()

          return true
        }

        const lease = await sut.acquire({ whenBusy: 'takeover' })

        expect(holder.isReleased).toBe(true)
        expect(lease.isReleased).toBe(false)
      })

      test('should fail if a session of the same tab keeps the camera', async () => {
        const holder = await sut.acquire()
        holder.onTakeover = async () => false

        const error = await sut.acquire({ whenBusy: 'takeover' }).catch((reason: unknown) => reason)

        expect((error as MediaDeviceBusyError).holder).toBe('this-tab')
      })

      test('should ignore a request for another kind of device', async () => {
        const holder = await sut.acquire()
        holder.onTakeover = vi.fn(async () => true)
        const microphones = [browser.openTab('microphone', 'exclusive'), browser.openTab('microphone', 'exclusive')]
        await microphones[0]?.access.acquire()

        await microphones[1]?.access.acquire({ whenBusy: 'takeover' }).catch(() => undefined)

        expect(holder.onTakeover).not.toHaveBeenCalled()
      })

      test('should stop when the signal aborts', async () => {
        await browser.openTab().access.acquire()
        const controller = new AbortController()
        const reason = new Error('the user left')

        const taking = sut.acquire({ whenBusy: 'takeover', signal: controller.signal })
        controller.abort(reason)

        await expect(taking).rejects.toBe(reason)
      })
    })
  })

  describe('lease', () => {
    test('should request access for the back with the facing of the back', async () => {
      await using lease = await sut.acquire()

      const stream = await lease.requestAccess('back')

      expect(browser.devices.requests).toEqual([{ video: { facingMode: { exact: 'environment' } } }])
      expect(stream.getTracks()[0]?.label).toContain('facing back')
      expect(sut.state.back).toBe('granted')
    })

    test('should start one stream after another when two are asked for at once', async () => {
      await using lease = await sut.acquire()

      const [first, second] = await Promise.all([lease.requestAccess('back'), lease.requestAccess('front')])

      expect(first.getTracks()[0]?.readyState).toBe('ended')
      expect(lease.stream).toBe(second)
      expect(browser.devices.liveTracks).toHaveLength(1)
    })

    test('should request access for the front with the facing of the front', async () => {
      await using lease = await sut.acquire()

      await lease.requestAccess('front')

      expect(browser.devices.requests).toEqual([{ video: { facingMode: { exact: 'user' } } }])
      expect(sut.state.front).toBe('granted')
    })

    test('should not insist on the facing where no camera has it', async () => {
      const desktop = new FakeMediaBrowser({ inputs: FakeMediaDevices.desktop() })
      const access = desktop.openTab().access
      await using lease = await access.acquire()

      const stream = await lease.requestAccess('back')

      expect(desktop.devices.requests).toEqual([
        { video: { facingMode: { exact: 'environment' } } },
        { video: { facingMode: { ideal: 'environment' } } },
      ])
      expect(stream.getTracks()[0]?.label).toBe('HD Webcam')
      expect(access.state.back).toBe('granted')
    })

    test('should request access without a facing for a microphone', async () => {
      const microphone = browser.openTab('microphone').access
      await using lease = await microphone.acquire()

      await lease.requestAccess('any')

      expect(browser.devices.requests).toEqual([{ audio: true }])
      expect(microphone.state.any).toBe('granted')
    })

    test('should record a refusal and report it', async () => {
      browser.devices.permission.camera = 'denied'
      await using lease = await sut.acquire()

      await expect(lease.requestAccess('back')).rejects.toBeInstanceOf(PermissionDeniedError)
      expect(sut.state.back).toBe('denied')
    })

    test('should record that there is no device', async () => {
      const empty = new FakeMediaBrowser({ inputs: [] })
      const access = empty.openTab().access
      await using lease = await access.acquire()

      await expect(lease.requestAccess('back')).rejects.toBeInstanceOf(MediaDeviceNotFoundError)
      expect(access.state.back).toBe('unavailable')
    })

    test('should request access again after a refusal, the user may have changed their mind', async () => {
      browser.devices.permission.camera = 'denied'
      await sut.requestAccess(['back'])
      browser.devices.permission.camera = 'prompt'

      await sut.requestAccess(['back'])

      expect(sut.state.back).toBe('granted')
    })

    test('should stop the stream of the access request before the next device starts', async () => {
      await using lease = await sut.acquire()

      const first = await lease.requestAccess('back')
      const second = await lease.requestAccess('front')

      expect(first.getTracks()[0]?.readyState).toBe('ended')
      expect(second.getTracks()[0]?.readyState).toBe('live')
      expect(lease.stream).toBe(second)
      expect(browser.devices.liveTracks).toHaveLength(1)
    })

    describe('#ensureAccess', () => {
      test('should only request what is missing', async () => {
        await sut.requestAccess(['back'])
        await using lease = await sut.acquire()

        await lease.ensureAccess(['back', 'front'])

        expect(browser.devices.requests).toEqual([
          { video: { facingMode: { exact: 'environment' } } },
          { video: { facingMode: { exact: 'user' } } },
        ])
      })

      test('should accept a facing without access as long as another one has it', async () => {
        const backOnly = new FakeMediaBrowser({
          inputs: FakeMediaDevices.phone().filter((input) => input.facing !== 'user'),
        })

        // the fallback without a facing is refused as well
        backOnly.devices.beforeCall = ({ constraints }) => {
          const video = constraints?.video as MediaTrackConstraints | undefined

          if (JSON.stringify(video?.facingMode).includes('user')) {
            throw new DOMException('no such camera', 'NotFoundError')
          }
        }

        const access = backOnly.openTab().access
        await using lease = await access.acquire()

        await lease.ensureAccess(['back', 'front'])

        expect(access.state.back).toBe('granted')
        expect(access.state.front).toBe('unavailable')
      })

      test('should fail if no facing ends up with access', async () => {
        browser.devices.permission.camera = 'denied'
        await using lease = await sut.acquire()

        await expect(lease.ensureAccess(['back', 'front'])).rejects.toBeInstanceOf(PermissionDeniedError)
      })

      test('should not carry on after a failure that is not an answer', async () => {
        browser.devices.beforeCall = () => {
          throw new DOMException('Could not start video source', 'NotReadableError')
        }

        await using lease = await sut.acquire()

        await expect(lease.ensureAccess(['back', 'front'])).rejects.toBeInstanceOf(MediaDeviceBusyError)
        expect(browser.devices.requests).toHaveLength(1)
        expect(sut.state.back).toBe('locked')
      })
    })

    describe('#open', () => {
      test('should request access for the facing before it opens a camera by its id', async () => {
        await using lease = await sut.acquire()

        const stream = await lease.open({ deviceId: 'back-1', scope: 'back' })

        expect(browser.devices.requests).toEqual([
          { video: { facingMode: { exact: 'environment' } } },
          { video: { deviceId: { exact: 'back-1' } } },
        ])
        expect(stream.getTracks()[0]?.label).toBe('camera2 2, facing back')
      })

      test('should not request access twice', async () => {
        await sut.requestAccess(['back'])
        await using lease = await sut.acquire()

        await lease.open({ deviceId: 'back-1', scope: 'back' })

        expect(browser.devices.requests).toHaveLength(2)
      })

      test('should not take access for the front as access for the back', async () => {
        await sut.requestAccess(['front'])
        await using lease = await sut.acquire()

        await lease.open({ deviceId: 'back-0', scope: 'back' })

        expect(browser.devices.requests.at(-2)).toEqual({ video: { facingMode: { exact: 'environment' } } })
        expect(sut.state.back).toBe('granted')
      })

      test('should let the browser pick a camera of the facing where no id is given', async () => {
        await using lease = await sut.acquire()

        await lease.open({ scope: 'front', constraints: { width: { ideal: 1280 } } })

        expect(browser.devices.requests).toEqual([{ video: { width: { ideal: 1280 }, facingMode: { exact: 'user' } } }])
        expect(sut.state.front).toBe('granted')
      })

      test('should pass the constraints on', async () => {
        await sut.requestAccess(['back'])
        await using lease = await sut.acquire()

        await lease.open({ deviceId: 'back-0', scope: 'back', constraints: { width: { ideal: 1920 } } })

        expect(browser.devices.requests.at(-1)).toEqual({
          video: { width: { ideal: 1920 }, deviceId: { exact: 'back-0' } },
        })
      })

      test('should stop the running stream before it starts the next one', async () => {
        await using lease = await sut.acquire()

        const first = await lease.open({ deviceId: 'back-0', scope: 'back' })
        const second = await lease.open({ deviceId: 'back-1', scope: 'back' })

        expect(first.getTracks()[0]?.readyState).toBe('ended')
        expect(second.getTracks()[0]?.readyState).toBe('live')
      })

      test('should turn the errors of the browser into errors of the library', async () => {
        await sut.requestAccess(['back'])
        await using lease = await sut.acquire()

        const error = await lease.open({ deviceId: 'gone', scope: 'back' }).catch((reason: unknown) => reason)

        expect(error).toBeInstanceOf(MediaRequirementsError)
        expect((error as MediaRequirementsError).constraint).toBe('deviceId')
      })

      test('should not open anything once it is released', async () => {
        const lease = await sut.acquire()
        await lease.release()

        await expect(lease.open({ scope: 'back' })).rejects.toBeInstanceOf(SessionClosedError)
        expect(browser.devices.requests).toEqual([])
      })

      test('should stop a stream that starts after the lease was released', async () => {
        const lease = await sut.acquire()

        const opening = lease.open({ scope: 'back' })
        const releasing = lease.release()

        await expect(opening).rejects.toBeInstanceOf(SessionClosedError)
        await releasing
        expect(browser.devices.liveTracks).toEqual([])
      })
    })

    describe('#stop', () => {
      test('should stop the stream and keep the lock', async () => {
        const lease = await sut.acquire()
        const stream = await lease.open({ scope: 'back' })

        lease.stop()

        expect(stream.getTracks()[0]?.readyState).toBe('ended')
        expect(lease.stream).toBeUndefined()
        expect(await isLocked()).toBe(true)
      })
    })

    describe('#release', () => {
      test('should stop the stream', async () => {
        const lease = await sut.acquire()
        await lease.open({ scope: 'back' })

        await lease.release()

        expect(browser.devices.liveTracks).toEqual([])
      })

      test('should be callable any number of times', async () => {
        const lease = await sut.acquire()

        await Promise.all([lease.release(), lease.release()])
        await lease.release()

        expect(await isLocked()).toBe(false)
      })
    })
  })

  describe('#requestAccess', () => {
    test('should hold the lock for the request only', async () => {
      const locked: boolean[] = []
      const audit = browser.devices.beforeCall
      browser.devices.beforeCall = async (call) => {
        locked.push(await isLocked())
        await audit?.(call)
      }

      await sut.requestAccess(['back', 'front'])

      expect(locked).toEqual([true, true])
      expect(await isLocked()).toBe(false)
    })

    test('should not leave a device running', async () => {
      await sut.requestAccess(['back', 'front'])

      expect(browser.devices.liveTracks).toEqual([])
    })

    test('should not touch the device if access was granted already', async () => {
      await sut.requestAccess(['back'])
      await browser.openTab().access.acquire()

      await expect(sut.requestAccess(['back'])).resolves.toBe(sut.state)
      expect(browser.devices.requests).toHaveLength(1)
    })

    test('should report a refusal through the state instead of failing', async () => {
      browser.devices.permission.camera = 'denied'

      const state = await sut.requestAccess(['back', 'front'])

      expect(state.back).toBe('denied')
      expect(state.front).toBe('denied')
      expect(await isLocked()).toBe(false)
    })

    test('should fail if another tab holds the camera', async () => {
      await browser.openTab().access.acquire()

      await expect(sut.requestAccess(['back'])).rejects.toBeInstanceOf(MediaDeviceBusyError)
      expect(browser.devices.requests).toEqual([])
    })

    test('should follow the busy policy', async () => {
      const holder = await browser.openTab().access.acquire()

      const requesting = sut.requestAccess(['back'], { whenBusy: 'wait' })
      await flush()
      await holder.release()

      expect((await requesting).back).toBe('granted')
    })

    test('should release the lock if the device fails', async () => {
      browser.devices.beforeCall = () => {
        throw new DOMException('Could not start video source', 'NotReadableError')
      }

      await expect(sut.requestAccess(['back'])).rejects.toBeInstanceOf(MediaDeviceBusyError)
      expect(await isLocked()).toBe(false)
    })
  })

  describe('#enumerate', () => {
    test('should list nothing and ask nothing before access was requested', async () => {
      expect(await sut.enumerate()).toEqual([])
      expect(browser.devices.calls).toEqual([])
    })

    test('should list the cameras once access was requested', async () => {
      await sut.requestAccess(['back'])

      const cameras = await sut.enumerate()

      expect(cameras.map((camera) => camera.deviceId)).toEqual(['front-0', 'front-1', 'back-0', 'back-1'])
    })

    test('should list the microphones for a microphone', async () => {
      const microphone = browser.openTab('microphone').access
      await microphone.requestAccess(['any'])

      const microphones = await microphone.enumerate()

      expect(microphones.map((device) => device.deviceId)).toEqual(['microphone-0'])
    })

    test('should list nothing after a refusal', async () => {
      browser.devices.permission.camera = 'denied'
      await sut.requestAccess(['back'])

      expect(await sut.enumerate()).toEqual([])
      expect(browser.devices.calls.some((call) => call.method === 'enumerateDevices')).toBe(false)
    })

    test('should list nothing where the browser has no media devices', async () => {
      const access = new FakeMediaBrowser(undefined, { navigator: {} as Navigator }).openTab().access

      expect(await access.enumerate()).toEqual([])
    })
  })

  describe('#availability', () => {
    const watch = (access: MediaAccess) => {
      const changes: MediaAvailability[] = []
      access.on('availabilitychange', (availability) => changes.push(availability))

      return changes
    }

    test('should be free at first', async () => {
      expect(sut.availability).toBe('free')
      expect(await sut.refreshAvailability()).toBe('free')
    })

    test('should start one check at a time when it is read again and again', async () => {
      const query = vi.spyOn(browser.locks, 'query')

      expect([sut.availability, sut.availability, sut.availability]).toEqual(['free', 'free', 'free'])
      await flush()

      expect(query).toHaveBeenCalledTimes(1)
    })

    test('should be held by this tab while it holds the camera', async () => {
      const changes = watch(sut)

      const lease = await sut.acquire()
      expect(sut.availability).toBe('held-by-this-tab')

      await lease.release()
      await flush()

      expect(sut.availability).toBe('free')
      expect(changes).toEqual(['held-by-this-tab', 'free'])
    })

    test('should follow what another tab does', async () => {
      const changes = watch(sut)
      await flush()

      const lease = await browser.openTab().access.acquire()
      await flush()
      expect(sut.availability).toBe('held-by-other-tab')

      await lease.release()
      await flush()

      expect(changes).toEqual(['held-by-other-tab', 'free'])
    })

    test('should find a camera that was held before anyone listened', async () => {
      await browser.openTab().access.acquire()

      expect(await sut.refreshAvailability()).toBe('held-by-other-tab')
    })

    test('should check in the background when it is read without a listener', async () => {
      await browser.openTab().access.acquire()

      expect(sut.availability).toBe('free')
      await flush()

      expect(sut.availability).toBe('held-by-other-tab')
    })

    test('should notice a tab that was closed without saying so', async () => {
      const changes = watch(sut)
      let closeTab!: () => void
      // a tab that holds the lock and never sends a message
      void browser.locks.request(cameraLock, {}, () => new Promise<void>((resolve) => (closeTab = resolve)))
      await sut.refreshAvailability()

      closeTab()
      await flush(40)

      expect(changes).toEqual(['held-by-other-tab', 'free'])
    })

    test('should not take a microphone that is shared for held', async () => {
      const microphone = browser.openTab('microphone').access
      await browser.openTab('microphone').access.acquire()

      expect(await microphone.refreshAvailability()).toBe('free')
    })

    test('should take a microphone that another tab keeps to itself for held', async () => {
      const microphone = browser.openTab('microphone').access
      await browser.openTab('microphone').access.acquire({ mode: 'exclusive' })

      expect(await microphone.refreshAvailability()).toBe('held-by-other-tab')
    })

    test('should stop checking once nobody listens', async () => {
      const subscription = sut.on('availabilitychange', () => undefined)
      await browser.openTab().access.acquire()
      await flush()
      const query = vi.spyOn(browser.locks, 'query')

      subscription.unsubscribe()
      await flush(40)

      expect(query).not.toHaveBeenCalled()
    })
  })

  describe('devicechange', () => {
    test('should only listen to the browser while someone listens', async () => {
      expect(browser.devices.listenerCount).toBe(0)

      const subscription = sut.on('devicechange', () => undefined)
      expect(browser.devices.listenerCount).toBe(1)

      subscription.unsubscribe()
      expect(browser.devices.listenerCount).toBe(0)
    })

    test('should announce a device that was plugged in', async () => {
      const listener = vi.fn()
      sut.on('devicechange', listener)

      browser.devices.plug({ deviceId: 'usb-0', kind: 'videoinput', label: 'USB camera' })

      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('#dispose', () => {
    test('should stop every device and free the lock', async () => {
      const lease = await sut.acquire()
      await lease.open({ scope: 'back' })

      sut.dispose()
      await flush()

      expect(browser.devices.liveTracks).toEqual([])
      expect(await isLocked()).toBe(false)
    })

    test('should stop listening to the browser', async () => {
      sut.on('devicechange', () => undefined)

      sut.dispose()

      expect(browser.devices.listenerCount).toBe(0)
    })
  })
})
