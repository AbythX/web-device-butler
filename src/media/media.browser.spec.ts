import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import type { MediaAvailability } from './access/media-access.ts'
import { MediaDeviceBusyError } from './errors/media-device-busy-error.ts'
import { MediaRequirementsError } from './errors/media-requirements-error.ts'
import type { MediaSessionEnd } from './session/media-session.ts'
import { TestInputManager } from './testing/input/test-input-manager.ts'

/**
 * These specs run in real browsers, against a camera that the browser fakes, real Web Locks and a real second tab.
 * The fake camera has no facing, no torch and no zoom, so the specs cover the access gate and the coordination
 * between tabs, not the features of a camera.
 */
const cameraLock = 'web-device-butler:camera'

// a browser that cannot fake a camera has nothing to run the specs against
const hasCamera = await (navigator.mediaDevices?.getUserMedia({ video: true }) ?? Promise.reject()).then(
  (stream) => {
    stream.getTracks().forEach((track) => track.stop())

    return true
  },
  () => false
)

const isLocked = async () => (await navigator.locks.query()).held?.some((lock) => lock.name === cameraLock) ?? false

const waitFor = async (condition: () => boolean | Promise<boolean>) => {
  for (let attempt = 0; attempt < 300 && !(await condition()); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe.skipIf(!hasCamera)('the media core in a real browser', () => {
  let sut!: TestInputManager

  beforeEach(async () => {
    // Firefox only starts a camera in the tab that is in the foreground
    await commands.showFirstTab()
    sut = TestInputManager.inBrowser()
  })

  afterEach(async () => {
    sut.dispose()
    await commands.closeSecondTab()
    await waitFor(async () => !(await isLocked()))
  })

  describe('access', () => {
    test('should list nothing before access was requested and the cameras after it', async () => {
      expect(await sut.list()).toEqual([])

      const state = await sut.requestAccess()
      const cameras = await sut.list()

      expect(state.isGranted('any')).toBe(true)
      expect(cameras.length).toBeGreaterThan(0)
      expect(cameras.every((camera) => camera.id.length > 0 && camera.label.length > 0)).toBe(true)
    })

    test('should get access for a facing that no camera has, as on a desktop', async () => {
      const state = await sut.requestAccess({ facing: 'back' })

      expect(state.back).toBe('granted')
    })

    test('should hold the lock for the request only and leave no camera running', async () => {
      await sut.requestAccess()

      expect(await isLocked()).toBe(false)
      expect(sut.availability).toBe('free')
    })
  })

  describe('session', () => {
    test('should open a camera and hold the lock until the session is closed', async () => {
      const session = await sut.open()

      expect(session.state).toBe('live')
      expect(session.track.readyState).toBe('live')
      expect(session.stream.getVideoTracks()).toEqual([session.track])
      expect(await isLocked()).toBe(true)

      await session.close()

      expect(session.track.readyState).toBe('ended')
      expect(await isLocked()).toBe(false)
    })

    test('should open the camera with the id it was asked for', async () => {
      await sut.requestAccess()
      const camera = (await sut.list()).at(-1)

      await using session = await sut.open({ id: camera?.id })

      expect(session.track.getSettings().deviceId).toBe(camera?.id)
    })

    test('should change a running track through the queue', async () => {
      await using session = await sut.open()

      await Promise.all([
        session.constraints.apply({ frameRate: { ideal: 10 } }),
        session.constraints.apply({ width: { ideal: 320 } }),
      ])

      // the second change did not replace the first one, and neither replaced what the camera was opened with
      expect(Object.keys(session.track.getConstraints())).toEqual(
        expect.arrayContaining(['deviceId', 'frameRate', 'width'])
      )
    })

    test('should turn a change the camera cannot make into an error of the library', async () => {
      await using session = await sut.open()

      const error = await session.constraints.apply({ deviceId: { exact: 'another' } }).catch((reason) => reason)

      expect(error).toBeInstanceOf(MediaRequirementsError)
      expect((error as MediaRequirementsError).constraint).toBe('deviceId')
    })

    test('should refuse a second session in the same tab', async () => {
      await using _session = await sut.open()

      const error = await sut.open().catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(MediaDeviceBusyError)
      expect((error as MediaDeviceBusyError).holder).toBe('this-tab')
    })
  })

  describe('second tab', () => {
    test('should not let the second tab open the camera while a session runs', async () => {
      await using session = await sut.open()

      const second = await commands.openCameraInSecondTab({ whenBusy: 'fail' })

      expect(second).toEqual({ isOpen: false, error: 'MediaDeviceBusyError', holder: 'other-tab' })
      expect(session.state).toBe('live')
      expect(session.track.readyState).toBe('live')
    })

    test('should fail if the second tab holds the camera', async () => {
      expect(await commands.openCameraInSecondTab({ whenBusy: 'fail' })).toEqual({ isOpen: true })

      const error = await sut.open().catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(MediaDeviceBusyError)
      expect((error as MediaDeviceBusyError).holder).toBe('other-tab')
    })

    test('should wait until the second tab closes its session', async () => {
      await commands.openCameraInSecondTab({ whenBusy: 'fail' })

      const opening = sut.open({ whenBusy: 'wait' })
      await commands.closeCameraInSecondTab()
      await commands.showFirstTab()

      await using session = await opening
      expect(session.state).toBe('live')
    })

    test('should get the camera when the second tab is closed', async () => {
      await commands.openCameraInSecondTab({ whenBusy: 'fail' })

      const opening = sut.open({ whenBusy: 'wait' })
      await commands.closeSecondTab()

      await using session = await opening
      expect(session.state).toBe('live')
    })

    test('should take the camera over from the second tab', async () => {
      await commands.openCameraInSecondTab({ whenBusy: 'fail' })
      await commands.showFirstTab()

      await using session = await sut.open({ whenBusy: 'takeover' })

      expect(session.state).toBe('live')
      expect(await commands.cameraInSecondTab()).toEqual({ state: 'ended', endReason: 'taken-over' })
    })

    test('should give the camera to the second tab that takes it over', async () => {
      const session = await sut.open()
      const ends: MediaSessionEnd[] = []
      session.on('ended', (end) => ends.push(end))

      const second = await commands.openCameraInSecondTab({ whenBusy: 'takeover' })

      expect(second).toEqual({ isOpen: true })
      expect(session.state).toBe('ended')
      expect(session.track.readyState).toBe('ended')
      expect(ends).toEqual([{ reason: 'taken-over' }])
    })

    test('should keep the camera if the application does not allow a take-over', async () => {
      await using session = await sut.open()
      session.allowTakeover = false

      const second = await commands.openCameraInSecondTab({ whenBusy: 'takeover' })

      expect(second).toEqual({ isOpen: false, error: 'MediaDeviceBusyError', holder: 'other-tab' })
      expect(session.state).toBe('live')
    })

    test('should fail to take over a camera that the second tab keeps', async () => {
      await commands.openCameraInSecondTab({ whenBusy: 'fail', allowTakeover: false })

      await expect(sut.open({ whenBusy: 'takeover' })).rejects.toBeInstanceOf(MediaDeviceBusyError)
      expect((await commands.cameraInSecondTab()).state).toBe('live')
    })

    test('should follow what the second tab does with the camera', async () => {
      const changes: MediaAvailability[] = []
      sut.on('availabilitychange', (availability) => changes.push(availability))

      await commands.openCameraInSecondTab({ whenBusy: 'fail' })
      await waitFor(() => changes.length === 1)
      await commands.closeCameraInSecondTab()
      await waitFor(() => changes.length === 2)

      expect(changes).toEqual(['held-by-other-tab', 'free'])
    })

    test('should notice that the second tab was closed while it held the camera', async () => {
      const changes: MediaAvailability[] = []
      sut.on('availabilitychange', (availability) => changes.push(availability))
      await commands.openCameraInSecondTab({ whenBusy: 'fail' })
      await waitFor(() => changes.length === 1)

      await commands.closeSecondTab()
      await waitFor(() => changes.length === 2)

      expect(changes).toEqual(['held-by-other-tab', 'free'])
    })
  })
})
