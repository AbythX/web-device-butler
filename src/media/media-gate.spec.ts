import { afterEach, describe, expect, test } from 'vitest'

import type { MediaAccessScope } from './access/media-access-state.ts'
import { MediaPermissionRequester } from './access/media-permission-requester.ts'
import { FakeMediaBrowser } from './testing/fake-media-browser.ts'
import { FakeMediaDevices, type FakeMediaCall, type FakeMediaDevicesOptions } from './testing/fake-media-devices.ts'
import { TestInputManager } from './testing/input/test-input-manager.ts'

/**
 * A manager that requests access for the front only, whatever it opens.
 */
class CarelessInputManager extends TestInputManager {
  protected override accessScopes(): readonly MediaAccessScope[] {
    return ['front']
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

/**
 * What an application can do with a manager, each from a page that was just loaded.
 */
const paths: Record<string, (manager: TestInputManager, browser: FakeMediaBrowser) => Promise<unknown>> = {
  list: (manager) => manager.list(),
  'list after access': async (manager) => {
    await manager.requestAccess()

    return manager.list()
  },
  requestAccess: (manager) => manager.requestAccess(),
  'requestAccess for one facing': (manager) => manager.requestAccess({ facing: 'front' }),
  select: (manager) => manager.select(),
  'select for one facing': (manager) => manager.select({ facing: 'back' }),
  open: async (manager) => (await manager.open()).close(),
  'open for the back': async (manager) => (await manager.open({ facing: 'back' })).close(),
  'open for the front': async (manager) => (await manager.open({ facing: 'front' })).close(),
  'open by id': async (manager) => (await manager.open({ id: 'back-1' })).close(),
  'open by id after access for the other facing': async (manager) => {
    await manager.requestAccess({ facing: 'front' })
    await (await manager.open({ id: 'back-0' })).close()
  },
  'open twice': async (manager) => {
    await (await manager.open({ facing: 'front' })).close()
    await (await manager.open({ facing: 'back' })).close()
  },
  'open in a second tab': async (manager, browser) => {
    const session = await manager.open({ facing: 'back' })
    const second = new TestInputManager(browser.openTab().access)

    await (await second.open({ facing: 'back', whenBusy: 'takeover' })).close()
    await session.close()
  },
  'open while another tab waits': async (manager, browser) => {
    const session = await manager.open({ facing: 'back' })
    const waiting = new TestInputManager(browser.openTab().access).open({ id: 'back-1', whenBusy: 'wait' })
    await flush()

    await session.close()
    await (await waiting).close()
  },
  'a device is plugged in': async (manager, browser) => {
    manager.on('change', () => undefined)
    browser.devices.plug({ deviceId: 'usb-0', kind: 'videoinput', label: 'USB camera' })
    await flush()
  },
  'a device is plugged in after access': async (manager, browser) => {
    await manager.requestAccess({ facing: 'back' })
    manager.on('change', () => undefined)
    browser.devices.plug({ deviceId: 'usb-0', kind: 'videoinput', label: 'USB camera' })
    await flush()
  },
  'permission request': (_manager, browser) =>
    new MediaPermissionRequester(browser.openTab().access, ['back', 'front']).request({}),
  'a call that fails': (manager) => manager.open({ id: 'gone' }).catch(() => undefined),
}

const phones: Record<string, FakeMediaDevicesOptions> = {
  'a phone that runs one camera at a time': { inputs: FakeMediaDevices.phone(), oneCameraAtATime: true },
  'a phone whose back cameras need access for the back': {
    inputs: FakeMediaDevices.phone(),
    oneCameraAtATime: true,
    backNeedsFacingRequest: true,
  },
}

/**
 * The reason the access gate exists, proven for every path: nothing is listed and no camera is opened by its id
 * before access was requested for it, and no device is started without the lock.
 */
describe('media-gate', () => {
  let browser!: FakeMediaBrowser

  afterEach(() => {
    browser.close()
  })

  describe.each(Object.entries(phones))('on %s', (_name, options) => {
    test.each(Object.keys(paths))('should keep the rules: %s', async (path) => {
      browser = new FakeMediaBrowser(options)
      const manager = new TestInputManager(browser.openTab().access)

      await paths[path]?.(manager, browser)
      manager.dispose()
      await flush()

      expect(browser.devices.violations).toEqual([])
      expect(browser.devices.liveTracks).toEqual([])
    })

    test.each(Object.keys(paths))('should request access before anything else: %s', async (path) => {
      browser = new FakeMediaBrowser(options)
      const manager = new TestInputManager(browser.openTab().access)

      await paths[path]?.(manager, browser)
      manager.dispose()

      const isAccessRequest = ({ method, constraints }: FakeMediaCall) =>
        method === 'getUserMedia' && JSON.stringify(constraints).includes('facingMode')

      const [first] = browser.devices.calls
      expect(first === undefined || isAccessRequest(first)).toBe(true)
    })
  })

  test('should open the back camera that refuses to start without access for the back', async () => {
    browser = new FakeMediaBrowser(phones['a phone whose back cameras need access for the back'])
    const manager = new TestInputManager(browser.openTab().access)
    await manager.requestAccess({ facing: 'front' })

    await using session = await manager.open({ id: 'back-0' })

    expect(session.track.label).toBe('camera2 0, facing back')
  })

  test('should request access for the back even if the manager only asked for the front', async () => {
    browser = new FakeMediaBrowser(phones['a phone whose back cameras need access for the back'])
    const manager = new CarelessInputManager(browser.openTab().access)

    await using session = await manager.open({ id: 'back-0' })

    expect(session.track.label).toBe('camera2 0, facing back')
    expect(browser.devices.violations).toEqual([])
    expect(browser.devices.requests).toEqual([
      { video: { facingMode: { exact: 'user' } } },
      { video: { facingMode: { exact: 'environment' } } },
      { video: { deviceId: { exact: 'back-0' } } },
    ])
  })

  // without these, the specs above would pass with an audit that notices nothing
  describe('audit', () => {
    test('should notice a list that is read before access', async () => {
      browser = new FakeMediaBrowser()

      await browser.devices.enumerateDevices()

      expect(browser.devices.violations).toEqual(['enumerateDevices was called before access was requested'])
    })

    test('should notice a camera that is opened by its id before access for its facing', async () => {
      browser = new FakeMediaBrowser()
      await using lease = await browser.openTab().access.acquire()
      await lease.requestAccess('front')
      lease.stop()

      await browser.devices.getUserMedia({ video: { deviceId: { exact: 'back-0' } } })

      expect(browser.devices.violations).toEqual([
        "'back-0' was requested by its id before access was requested for its facing",
      ])
    })

    test('should notice a camera that is started while another one runs', async () => {
      browser = new FakeMediaBrowser()
      await using lease = await browser.openTab().access.acquire()
      await lease.requestAccess('back')

      await browser.devices.getUserMedia({ video: { deviceId: { exact: 'back-1' } } }).catch(() => undefined)

      expect(browser.devices.violations).toEqual(['a camera was started while another one was running'])
    })

    test('should notice a device that is started without the lock', async () => {
      browser = new FakeMediaBrowser()

      await browser.devices.getUserMedia({ video: { facingMode: { exact: 'environment' } } })

      expect(browser.devices.violations).toEqual([
        "getUserMedia was called without holding the lock 'web-device-butler:camera'",
      ])
    })

    test('should not take the lock of the microphone for the lock of the camera', async () => {
      browser = new FakeMediaBrowser()
      await using _lease = await browser.openTab('microphone').access.acquire()

      await browser.devices.getUserMedia({ video: true })

      expect(browser.devices.violations).toHaveLength(1)
    })
  })
})
