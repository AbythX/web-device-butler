import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceBusyError } from '../errors/media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import { FakeMediaBrowser } from '../testing/fake-media-browser.ts'
import type { FakeMediaCall, FakeMediaDevicesOptions } from '../testing/fake-media-devices.ts'
import type { CameraManager } from './camera-manager.ts'
import type { CameraDescriptor } from './model/camera-descriptor.ts'
import type { CameraRequirements } from './model/camera-requirements.ts'
import { CameraTestBench } from './testing/camera-test-bench.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const mentions = (call: FakeMediaCall, text: string) => JSON.stringify(call.constraints ?? {}).includes(text)

/** the phones the access gate was written for */
const phone: FakeMediaDevicesOptions = {
  inputs: CameraTestBench.phone(),
  oneCameraAtATime: true,
  backNeedsFacingRequest: true,
}

const torchCamera: CameraRequirements = {
  facing: 'back',
  require: { torch: true },
  resolution: { width: 1920, height: 1080 },
}

describe('default-camera-manager', () => {
  let browser!: FakeMediaBrowser
  let sut!: CameraManager
  const pages: CameraManager[] = []

  /** another page of the browser: a second tab, or the next visit */
  const load = (configuration: CameraRequirements = {}) => {
    const manager = CameraTestBench.load(browser, configuration)
    pages.push(manager)

    return manager
  }

  const isLocked = async () =>
    (await browser.locks.query()).held?.some((lock) => lock.name === 'web-device-butler:camera') ?? false

  /** the cameras that were started by their id, in order */
  const startedById = () =>
    browser.devices.requests
      .map((request) => (request.video as MediaTrackConstraints).deviceId)
      .filter((deviceId) => deviceId !== undefined)
      .map((deviceId) => (deviceId as ConstrainDOMStringParameters).exact)

  const byId = (cameras: readonly CameraDescriptor[]) =>
    Object.fromEntries(cameras.map((camera) => [camera.id, camera]))

  beforeEach(() => {
    browser = new FakeMediaBrowser(phone)
    sut = load()
  })

  afterEach(async () => {
    pages.splice(0).forEach((page) => page.dispose())
    await flush()

    browser.close()
    browser.devices.assertNothingRuns()
    browser.devices.assertNoViolations()
  })

  describe('#list', () => {
    test('should list nothing and ask the browser nothing before access was requested', async () => {
      expect(await sut.list()).toEqual([])
      expect(browser.devices.calls).toEqual([])
    })

    test('should describe the cameras from the list of the browser after access', async () => {
      await sut.requestAccess()

      const cameras = await sut.list()

      expect(cameras.map((camera) => [camera.id, camera.facing, camera.detail])).toEqual([
        ['front-0', 'front', 'listed'],
        ['back-wide', 'back', 'listed'],
        ['back-main', 'back', 'listed'],
        ['front-1', 'front', 'listed'],
      ])
      expect(cameras.every((camera) => !camera.features.torch)).toBe(true)
    })

    test('should use what the browser knows about a camera without starting it', async () => {
      browser = new FakeMediaBrowser({
        inputs: [
          {
            deviceId: 'webcam',
            kind: 'videoinput',
            label: 'Webcam',
            staticCapabilities: { width: { max: 1280 }, height: { max: 720 } },
          },
        ],
      })
      sut = load()
      await sut.requestAccess()

      const [camera] = await sut.list()

      expect(camera?.detail).toBe('static')
      expect(camera?.features.maxResolution?.toString()).toBe('1280x720')
    })

    test('should never start a camera', async () => {
      await sut.requestAccess()
      const requests = browser.devices.requests.length

      await sut.list()

      expect(browser.devices.requests).toHaveLength(requests)
    })

    describe('with the detail probed', () => {
      test('should request access and find out what every camera can do', async () => {
        const cameras = byId(await sut.list({ detail: 'probed' }))

        expect(Object.values(cameras).map((camera) => camera.detail)).toEqual(['probed', 'probed', 'probed', 'probed'])
        expect(Object.values(cameras).filter((camera) => camera.features.torch)).toEqual([cameras['back-main']])
        expect(cameras['back-main']?.features.zoom).toMatchObject({ min: 1, max: 8 })
        expect(cameras['back-main']?.features.maxResolution?.toString()).toBe('3840x2160')
        expect(cameras['front-1']?.features.maxResolution?.toString()).toBe('1280x720')
      })

      test('should look at every camera, whatever the configuration prefers', async () => {
        sut = load({ facing: 'front', require: { torch: true } })

        const cameras = await sut.list({ detail: 'probed' })

        expect(cameras.map((camera) => camera.detail)).toEqual(['probed', 'probed', 'probed', 'probed'])
      })

      test('should start the cameras one after another and leave none running', async () => {
        await sut.list({ detail: 'probed' })

        // the fake phone refuses a second camera, the clean-up of every spec checks that it never had to
        expect(browser.devices.liveTracks).toEqual([])
        expect(await isLocked()).toBe(false)
      })

      test('should not start the camera of the access request a second time', async () => {
        await sut.list({ detail: 'probed' })

        // access for the back and the front, and the three cameras the access request for the front did not start
        expect(browser.devices.requests).toHaveLength(5)
        expect(startedById()).toEqual(['back-wide', 'back-main', 'front-1'])
      })

      test('should not start any camera on the next visit', async () => {
        await sut.list({ detail: 'probed' })
        const requests = browser.devices.requests.length

        const cameras = await load().list({ detail: 'probed' })

        expect(cameras.map((camera) => camera.detail)).toEqual(['probed', 'probed', 'probed', 'probed'])
        expect(startedById()).toHaveLength(3)
        // access is still requested on every page
        expect(browser.devices.requests).toHaveLength(requests + 2)
      })

      test('should leave the cameras of a facing that was refused as they are listed', async () => {
        const audit = browser.devices.beforeCall
        browser.devices.beforeCall = async (call) => {
          await audit?.(call)

          if (mentions(call, '"user"')) {
            throw new DOMException('Permission denied', 'NotAllowedError')
          }
        }

        const cameras = byId(await sut.list({ detail: 'probed' }))

        expect(sut.access.front).toBe('denied')
        expect(cameras['front-0']?.detail).toBe('listed')
        expect(cameras['back-main']?.detail).toBe('probed')
        // the refused request stopped the camera of the request before it
        expect(startedById()).toEqual(['back-wide', 'back-main'])
      })

      test('should go on with the other cameras if one does not start', async () => {
        const audit = browser.devices.beforeCall
        browser.devices.beforeCall = async (call) => {
          await audit?.(call)

          if (mentions(call, 'back-wide')) {
            throw new DOMException('Could not start video source', 'NotReadableError')
          }
        }

        const cameras = byId(await sut.list({ detail: 'probed' }))

        expect(cameras['back-wide']?.detail).toBe('listed')
        expect(cameras['back-main']?.features.torch).toBe(true)
        expect(cameras['front-1']?.detail).toBe('probed')
      })
    })

    test('should show what is remembered without starting a camera', async () => {
      await sut.list({ detail: 'probed' })
      const next = load()
      await next.requestAccess({ facing: 'back' })
      const requests = browser.devices.requests.length

      const cameras = byId(await next.list())

      expect(cameras['back-main']?.detail).toBe('probed')
      expect(cameras['back-main']?.features.torch).toBe(true)
      expect(browser.devices.requests).toHaveLength(requests)
    })
  })

  describe('#select', () => {
    test('should find the back camera with the torch among several back cameras', async () => {
      const camera = await sut.select({ facing: 'back', require: { torch: true } })

      expect(camera?.id).toBe('back-main')
      expect(camera?.detail).toBe('probed')
      expect(camera?.features.torch).toBe(true)
    })

    test('should wait for a torch that the camera does not report right away', async () => {
      // the torch of the fake main camera is missing from its first answer
      const camera = await sut.select({ facing: 'back', require: { torch: true } })

      expect(camera?.features.torch).toBe(true)
    })

    test('should never start a front camera to find a back camera', async () => {
      await sut.select({ facing: 'back', require: { torch: true } })

      expect(JSON.stringify(browser.devices.requests)).not.toContain('front')
      expect(JSON.stringify(browser.devices.requests)).not.toContain('user')
      expect(sut.access.front).toBe('locked')
    })

    test('should use the configured defaults and let a call override single fields', async () => {
      sut = load({ facing: 'back', require: { torch: true } })

      expect((await sut.select())?.id).toBe('back-main')
      expect((await sut.select({ facing: 'front', require: {} }))?.facing).toBe('front')
    })

    test('should return nothing if no camera has what is required', async () => {
      expect(await sut.select({ facing: 'front', require: { torch: true } })).toBeUndefined()
    })

    test('should return nothing if access is refused', async () => {
      browser.devices.permission.camera = 'denied'

      expect(await sut.select({ facing: 'back' })).toBeUndefined()
      expect(sut.access.back).toBe('denied')
    })

    test('should return the camera with the given id', async () => {
      expect((await sut.select({ id: 'front-1' }))?.id).toBe('front-1')
      expect(await sut.select({ id: 'gone' })).toBeUndefined()
    })

    test('should prefer features without insisting on them', async () => {
      expect((await sut.select({ prefer: { torch: true } }))?.id).toBe('back-main')
      expect((await sut.select({ facing: 'front', prefer: { torch: true } }))?.id).toBe('front-0')
    })

    test('should take the first camera that fits with the strategy first, without starting the others', async () => {
      const camera = await sut.select({ facing: 'back', strategy: 'first' })

      expect(camera?.id).toBe('back-wide')
      expect(startedById()).toEqual([])
    })

    test('should stop looking once a camera has what is required with the strategy first', async () => {
      const camera = await sut.select({ require: { torch: true }, strategy: 'first' })

      expect(camera?.id).toBe('back-main')
      // front-0 runs from the access request and has no torch, back-wide has none, back-main has: front-1 never starts
      expect(startedById()).toEqual(['back-wide', 'back-main'])
    })

    test('should leave no camera running and release the lock', async () => {
      await sut.select(torchCamera)

      expect(browser.devices.liveTracks).toEqual([])
      expect(await isLocked()).toBe(false)
    })

    test('should look at the cameras again when the browser gave them new ids', async () => {
      await sut.select(torchCamera)
      browser.devices.rotateIds()

      const camera = await load().select(torchCamera)

      expect(camera?.id).toBe('back-main-rotated')
      expect(camera?.features.torch).toBe(true)
      expect(startedById()).toContain('back-main-rotated')
    })

    test('should look at the cameras again when a camera was plugged in', async () => {
      await sut.list({ detail: 'probed' })
      browser.devices.plug({
        deviceId: 'usb',
        kind: 'videoinput',
        label: 'USB camera',
        capabilities: { torch: true, zoom: { min: 1, max: 20 } },
      })

      const camera = await load().select({ require: { torch: true } })

      expect(camera?.id).toBe('usb')
      expect(startedById().filter((id) => id === 'back-main')).toHaveLength(2)
    })

    describe('while another tab runs the camera', () => {
      test('should answer from what is remembered and not interrupt the other tab', async () => {
        const session = await sut.open(torchCamera)
        const requests = browser.devices.requests.length

        const camera = await load().select(torchCamera)

        expect(camera?.id).toBe('back-main')
        expect(camera?.features.torch).toBe(true)
        expect(session.state).toBe('live')
        expect(session.track.readyState).toBe('live')
        expect(browser.devices.requests).toHaveLength(requests)
      })

      test('should fail with the default policy if nothing is remembered', async () => {
        const session = await sut.open({ id: 'front-0' })
        browser.localStorage.clear()

        await expect(load().select(torchCamera)).rejects.toMatchObject({
          name: 'MediaDeviceBusyError',
          holder: 'other-tab',
        })
        expect(session.state).toBe('live')
      })

      test('should wait for the other tab with the policy wait if nothing is remembered', async () => {
        const session = await sut.open({ id: 'front-0' })
        browser.localStorage.clear()

        const selecting = load().select({ ...torchCamera, whenBusy: 'wait' })
        await flush()
        expect(session.state).toBe('live')
        await session.close()

        expect((await selecting)?.id).toBe('back-main')
      })
    })

    test('should answer from what is known while a session of the same page runs', async () => {
      const session = await sut.open(torchCamera)

      const camera = await sut.select({ facing: 'back', require: { zoom: true } })

      expect(camera?.id).toBe('back-main')
      expect(session.track.readyState).toBe('live')
    })
  })

  describe('#open', () => {
    test('should open the back camera with the torch at the configured resolution', async () => {
      sut = load(torchCamera)

      const session = await sut.open()

      expect(session.descriptor.id).toBe('back-main')
      expect(session.track.label).toBe('camera2 0, facing back')
      expect(session.settings.resolution?.toString()).toBe('1920x1080')
      expect(session.torch).toBeDefined()
      expect(session.zoom).toBeDefined()
      expect(session.state).toBe('live')
    })

    test('should correct what is remembered about a camera that lost a feature', async () => {
      await sut.list({ detail: 'probed' })
      const key = 'web-device-butler.camera-probes:cameras'
      const remembered = browser.localStorage.getItem(key) ?? ''
      // as if the wide camera had a torch when it was looked at
      browser.localStorage.setItem(key, remembered.replace(/("id":"back-wide".*?"torch":)false/, '$1true'))
      const visit = load()
      await visit.requestAccess({ facing: 'back' })
      expect(byId(await visit.list())['back-wide']?.features.torch).toBe(true)

      const session = await visit.open({ id: 'back-wide' })

      expect(session.descriptor.features.torch).toBe(false)
      expect(session.torch).toBeUndefined()
      await session.close()
      expect(byId(await visit.list())['back-wide']?.features.torch).toBe(false)
    })

    test('should open the same camera on the next visit with one access request and one start', async () => {
      await (await sut.open(torchCamera)).close()
      const requests = browser.devices.requests.length

      const session = await load(torchCamera).open()

      expect(session.descriptor.id).toBe('back-main')
      expect(session.settings.resolution?.toString()).toBe('1920x1080')
      expect(session.torch).toBeDefined()
      expect(browser.devices.requests.slice(requests)).toEqual([
        { video: { facingMode: { exact: 'environment' } } },
        { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, deviceId: { exact: 'back-main' } } },
      ])
    })

    test('should let a call override single fields of the configuration', async () => {
      sut = load(torchCamera)

      const session = await sut.open({ facing: 'front', require: {}, resolution: { width: 640, height: 480 } })

      expect(session.descriptor.facing).toBe('front')
      expect(session.settings.resolution?.toString()).toBe('640x480')
      expect(session.torch).toBeUndefined()
      expect(session.zoom).toBeUndefined()
      expect(session.focus).toBeUndefined()
    })

    test('should deliver the closest the camera can do to an ideal resolution', async () => {
      const session = await sut.open({ id: 'front-1', resolution: { width: 1920, height: 1080 }, frameRate: 60 })

      expect(session.settings.resolution?.toString()).toBe('1280x720')
      expect(session.settings.frameRate).toBe(30)
    })

    test('should fail if no camera delivers a resolution that is asked for exactly', async () => {
      const opening = sut.open({ facing: 'front', resolution: { width: 3840, height: 2160, mode: 'exact' } })

      await expect(opening).rejects.toThrow(MediaRequirementsError)
      await expect(opening).rejects.toThrow(/lacks resolution 3840x2160/)
      expect(await isLocked()).toBe(false)
    })

    test('should say which requirement removed which camera if none fits', async () => {
      const opening = sut.open({ facing: 'front', require: { torch: true } })

      await expect(opening).rejects.toThrow(MediaRequirementsError)
      await expect(opening).rejects.toThrow(
        "None of the 4 cameras fits the requirements: 'camera2 2, facing back' lacks facing 'front'; " +
          "'camera2 0, facing back' lacks facing 'front'; 'camera2 1, facing front' lacks torch; " +
          "'camera2 3, facing front' lacks torch"
      )
      expect(await isLocked()).toBe(false)
    })

    test('should open a camera by its id without looking at the others', async () => {
      const session = await sut.open({ id: 'back-main' })

      expect(session.descriptor.id).toBe('back-main')
      expect(startedById()).toEqual(['back-main'])
    })

    test('should describe a camera that was opened by its id from its running track, and remember that', async () => {
      const session = await sut.open({ id: 'back-main' })

      expect(session.descriptor.detail).toBe('probed')
      expect(session.descriptor.features.torch).toBe(true)
      expect(session.torch).toBeDefined()
      expect(byId(await sut.list())['back-main']?.detail).toBe('probed')
    })

    test('should fail for an id that no camera has', async () => {
      await expect(sut.open({ id: 'gone' })).rejects.toThrow(MediaDeviceNotFoundError)
    })

    test('should pass raw constraints on to the browser', async () => {
      const session = await sut.open({ id: 'front-0', constraints: { aspectRatio: 1 } })

      expect(browser.devices.requests.at(-1)).toEqual({ video: { aspectRatio: 1, deviceId: { exact: 'front-0' } } })
      await session.close()
    })

    test('should fail if access is refused', async () => {
      browser.devices.permission.camera = 'denied'

      await expect(sut.open(torchCamera)).rejects.toThrow(PermissionDeniedError)
      expect(await isLocked()).toBe(false)
    })

    test('should hold the camera until the session is closed', async () => {
      const session = await sut.open(torchCamera)

      await expect(sut.open(torchCamera)).rejects.toMatchObject({ holder: 'this-tab' })
      await expect(load().open(torchCamera)).rejects.toMatchObject({ holder: 'other-tab' })

      await session.close()
      await expect(load().open(torchCamera)).resolves.toBeDefined()
    })

    test('should take the camera over from another tab', async () => {
      const first = await sut.open(torchCamera)

      const second = await load().open({ ...torchCamera, whenBusy: 'takeover' })

      expect(first.state).toBe('ended')
      expect(second.descriptor.id).toBe('back-main')
      expect(second.track.readyState).toBe('live')
    })

    test('should look at the cameras again if the browser does not know a remembered camera', async () => {
      await sut.select(torchCamera)
      const starts = startedById().length
      const audit = browser.devices.beforeCall
      let hasFailed = false
      browser.devices.beforeCall = async (call) => {
        await audit?.(call)

        if (!hasFailed && mentions(call, 'back-main')) {
          hasFailed = true
          throw Object.assign(new Error('unknown device'), { name: 'OverconstrainedError', constraint: 'deviceId' })
        }
      }

      const session = await load().open(torchCamera)

      expect(session.descriptor.id).toBe('back-main')
      expect(session.torch).toBeDefined()
      // the failed start, both back cameras once more, and the start of the session
      expect(startedById().slice(starts)).toEqual(['back-main', 'back-wide', 'back-main', 'back-main'])
    })

    test('should fail if the browser does not know the camera after looking again either', async () => {
      await sut.select(torchCamera)
      const audit = browser.devices.beforeCall
      browser.devices.beforeCall = async (call) => {
        await audit?.(call)

        if (mentions(call, '"width"')) {
          throw Object.assign(new Error('unknown device'), { name: 'OverconstrainedError', constraint: 'deviceId' })
        }
      }

      await expect(load().open(torchCamera)).rejects.toThrow(MediaRequirementsError)
      expect(await isLocked()).toBe(false)
    })

    test('should open the webcam of a laptop for a back camera, because nothing there faces a way', async () => {
      browser = new FakeMediaBrowser({ inputs: CameraTestBench.laptop() })
      sut = load({ facing: 'back', resolution: { width: 1920, height: 1080 } })

      const session = await sut.open()

      expect(session.descriptor.id).toBe('webcam-0')
      expect(session.descriptor.facing).toBe('unknown')
      expect(session.settings.resolution?.toString()).toBe('1280x720')
      expect(session.torch).toBeUndefined()
    })

    test('should not open the webcam of a laptop if a torch is required', async () => {
      browser = new FakeMediaBrowser({ inputs: CameraTestBench.laptop() })
      sut = load()

      await expect(sut.open(torchCamera)).rejects.toThrow(/'Integrated Webcam' lacks torch/)
    })

    test('should close its sessions when it is disposed', async () => {
      const session = await sut.open(torchCamera)

      sut.dispose()
      await flush()

      expect(session.state).toBe('ended')
      expect(await isLocked()).toBe(false)
    })
  })

  describe('#prepare', () => {
    test('should request access, look at the cameras and say which one open() would start', async () => {
      sut = load(torchCamera)

      const result = await sut.prepare()

      expect(result.permission).toBe('granted')
      expect(result.cameras.map((camera) => camera.id)).toEqual(['front-0', 'back-wide', 'back-main', 'front-1'])
      expect(result.selected?.id).toBe('back-main')
      expect(result.isResolutionAvailable).toBe(true)
      expect(result.error).toBeUndefined()
    })

    test('should leave no camera running and release the lock', async () => {
      await load(torchCamera).prepare()

      expect(browser.devices.liveTracks).toEqual([])
      expect(await isLocked()).toBe(false)
    })

    test.each(['first', 'next'])(
      'should be followed by an open() that starts the selected camera, on the %s visit',
      async (visit) => {
        if (visit === 'next') {
          await load(torchCamera).prepare()
        }

        sut = load(torchCamera)

        const { selected } = await sut.prepare()
        const starts = startedById().length
        const session = await sut.open()

        expect(session.descriptor.id).toBe(selected?.id)
        expect(session.descriptor.id).toBe('back-main')
        expect(session.settings.resolution?.toString()).toBe('1920x1080')
        expect(session.torch).toBeDefined()
        // nothing but the selected camera is started by open()
        expect(startedById().slice(starts)).toEqual(['back-main'])
      }
    )

    test('should be cheap when it is called again', async () => {
      sut = load(torchCamera)
      await sut.prepare()
      const requests = browser.devices.requests.length

      const result = await sut.prepare()

      expect(result.selected?.id).toBe('back-main')
      expect(browser.devices.requests).toHaveLength(requests)
    })

    test('should let a call override the configuration', async () => {
      sut = load(torchCamera)

      const result = await sut.prepare({ facing: 'front', require: {} })

      expect(result.selected?.id).toBe('front-0')
    })

    test('should say that the selected camera cannot deliver the configured resolution', async () => {
      const result = await sut.prepare({ facing: 'front', resolution: { width: 3840, height: 2160 } })

      expect(result.selected?.id).toBe('front-0')
      expect(result.isResolutionAvailable).toBe(false)
    })

    test('should not say anything about the resolution if none is configured', async () => {
      expect((await sut.prepare({ facing: 'back' })).isResolutionAvailable).toBeUndefined()
    })

    test('should report that no camera fits instead of throwing', async () => {
      const result = await sut.prepare({ facing: 'front', require: { torch: true } })

      expect(result.permission).toBe('granted')
      expect(result.selected).toBeUndefined()
      expect(result.cameras).toHaveLength(4)
      expect(result.error).toBeInstanceOf(MediaRequirementsError)
      expect(result.error?.message).toContain("'camera2 1, facing front' lacks torch")
    })

    test('should report a refused permission instead of throwing', async () => {
      browser.devices.permission.camera = 'denied'

      const result = await sut.prepare(torchCamera)

      expect(result.permission).toBe('denied')
      expect(result.cameras).toEqual([])
      expect(result.selected).toBeUndefined()
      expect(result.error).toBeInstanceOf(PermissionDeniedError)
    })

    test('should report a page without cameras, such as one without HTTPS', async () => {
      browser = new FakeMediaBrowser(phone, { isSecureContext: false })

      const result = await load().prepare(torchCamera)

      expect(result.permission).toBe('unsupported')
      expect(result.error).toBeInstanceOf(UnsupportedError)
    })

    test('should report a camera that another tab holds if nothing is remembered', async () => {
      const session = await sut.open({ id: 'front-0' })
      browser.localStorage.clear()

      const result = await load().prepare(torchCamera)

      expect(result.error).toBeInstanceOf(MediaDeviceBusyError)
      expect(result.permission).toBe('unknown')
      expect(session.state).toBe('live')
    })

    test('should not interrupt the session of another tab, and answer from what is remembered', async () => {
      const session = await sut.open(torchCamera)
      const requests = browser.devices.requests.length

      const result = await load(torchCamera).prepare()

      expect(result.selected?.id).toBe('back-main')
      expect(result.permission).toBe('unknown')
      expect(session.state).toBe('live')
      expect(session.track.readyState).toBe('live')
      expect(browser.devices.requests).toHaveLength(requests)
    })

    test('should reject for a call that was aborted', async () => {
      const reason = new Error('the user left')

      await expect(sut.prepare({ signal: AbortSignal.abort(reason) })).rejects.toBe(reason)
    })
  })

  describe('#forget', () => {
    test('should look at the cameras again afterwards', async () => {
      await sut.select(torchCamera)
      const starts = startedById().length

      await sut.forget()

      expect((await sut.list()).every((camera) => camera.detail === 'listed')).toBe(true)
      expect((await sut.select(torchCamera))?.id).toBe('back-main')
      expect(startedById().length).toBeGreaterThan(starts)
    })
  })

  describe('events', () => {
    test('should announce the new list when a camera is plugged in', async () => {
      await sut.requestAccess()
      const lists: string[][] = []
      sut.on('change', (cameras) => lists.push(cameras.map((camera) => camera.id)))

      browser.devices.plug({ deviceId: 'usb', kind: 'videoinput', label: 'USB camera' })
      await flush()
      await flush()

      expect(lists).toEqual([['front-0', 'back-wide', 'back-main', 'front-1', 'usb']])
    })
  })

  describe('.create', () => {
    test('should build a manager that works on its own', async () => {
      const { DefaultCameraManager: Manager } = await import('./default-camera-manager.ts')
      const manager = Manager.create({ facing: 'back' }, browser.openEnvironment())
      pages.push(manager)

      const camera = await manager.select({ require: { torch: true } })

      expect(manager.configuration).toEqual({ facing: 'back' })
      expect(camera?.id).toBe('back-main')
    })
  })
})
