import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import type { MediaSessionEnd } from '../session/media-session.ts'
import { DefaultCameraManager } from './default-camera-manager.ts'
import type { CameraManager } from './camera-manager.ts'

/**
 * These specs run in real browsers, against the camera that the browser fakes, the real `localStorage`, real Web
 * Locks and a real second tab. The fake camera does not say which way it faces and has no torch, so the specs cover
 * the pipeline (access, probing, remembering, selecting, the session) and not the features of a phone camera.
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

const small = { width: 320, height: 240 }

describe.skipIf(!hasCamera)('the camera in a real browser', () => {
  let sut!: CameraManager
  const managers: CameraManager[] = []

  /** the camera manager of a page that was just loaded */
  const load = (configuration: Parameters<typeof DefaultCameraManager.create>[0] = {}) => {
    const manager = DefaultCameraManager.create(configuration)
    managers.push(manager)

    return manager
  }

  beforeEach(async () => {
    // Firefox only starts a camera in the tab that is in the foreground
    await commands.showFirstTab()
    localStorage.clear()
    sut = load({ facing: 'back', resolution: small })
  })

  afterEach(async () => {
    managers.splice(0).forEach((manager) => manager.dispose())
    await commands.closeSecondTab()
    await waitFor(async () => !(await isLocked()))
  })

  describe('discovery', () => {
    test('should find out what every camera can do by starting it', async () => {
      const cameras = await sut.list({ detail: 'probed' })

      expect(cameras.length).toBeGreaterThan(0)
      expect(cameras.every((camera) => camera.detail === 'probed')).toBe(true)
      expect(cameras.every((camera) => camera.features.maxResolution !== undefined)).toBe(true)
      expect(await isLocked()).toBe(false)
    })

    test('should remember the cameras for the next page', async () => {
      await sut.list({ detail: 'probed' })

      const next = load()
      await next.requestAccess()

      // a list without options never starts a camera
      expect((await next.list()).every((camera) => camera.detail === 'probed')).toBe(true)
    })

    test('should list the cameras without their features on a first visit', async () => {
      await sut.requestAccess()

      const cameras = await sut.list()

      expect(cameras.length).toBeGreaterThan(0)
      expect(cameras.every((camera) => camera.detail !== 'probed')).toBe(true)
    })
  })

  describe('prepare and open', () => {
    test.each(['first', 'next'])(
      'should select a camera and open it at the configured resolution, on the %s visit',
      async (visit) => {
        if (visit === 'next') {
          await load({ facing: 'back', resolution: small }).prepare()
        }

        const result = await sut.prepare()
        await using session = await sut.open()

        expect(result.permission).toBe('granted')
        expect(result.error).toBeUndefined()
        expect(result.isResolutionAvailable).toBe(true)
        expect(session.descriptor.id).toBe(result.selected?.id)
        expect(session.descriptor.detail).toBe('probed')
        expect(session.track.readyState).toBe('live')
        expect(session.settings.resolution?.toString()).toBe('320x240')
      }
    )

    test('should leave no camera running after prepare', async () => {
      await sut.prepare()

      expect(await isLocked()).toBe(false)
      expect(sut.availability).toBe('free')
    })

    test('should report that no camera has a torch, and refuse to open one', async () => {
      const result = await sut.prepare({ require: { torch: true } })

      expect(result.selected).toBeUndefined()
      expect(result.error).toBeInstanceOf(MediaRequirementsError)
      expect(result.error?.message).toContain('lacks torch')
      await expect(sut.open({ require: { torch: true } })).rejects.toBeInstanceOf(MediaRequirementsError)
      expect(await isLocked()).toBe(false)
    })

    test('should have no controls for what the camera lacks', async () => {
      await using session = await sut.open()

      expect(session.torch).toBeUndefined()
      expect(session.zoom === undefined).toBe(session.descriptor.features.zoom === undefined)
    })
  })

  describe('session', () => {
    test('should change the resolution of the running camera', async () => {
      await using session = await sut.open()
      const settings: string[] = []
      session.on('settingschange', (changed) => settings.push(String(changed.resolution)))

      await session.configure({ resolution: { width: 640, height: 480 } })

      // Firefox accepts the change for its fake camera and keeps delivering the old resolution; the settings of the
      // session say what is delivered, not what was asked for
      const delivered = session.track.getSettings()
      const hasChanged = delivered.width === 640
      expect(Object.keys(session.track.getConstraints())).toEqual(expect.arrayContaining(['width', 'height']))
      expect(session.settings).toMatchObject({ width: delivered.width, height: delivered.height })
      expect(settings).toEqual(hasChanged ? ['640x480'] : [])
      expect(session.track.readyState).toBe('live')
    })

    test('should continue with another camera as the same session', async () => {
      await using session = await sut.open()
      const cameras = await sut.list()
      const target = cameras.find((camera) => camera.id !== session.descriptor.id) ?? cameras[0]
      const previous = session.track

      await session.switchTo({ id: target?.id })

      expect(session.descriptor.id).toBe(target?.id)
      expect(session.track).not.toBe(previous)
      expect(previous.readyState).toBe('ended')
      expect(session.track.readyState).toBe('live')
      expect(session.state).toBe('live')
      expect(await isLocked()).toBe(true)
    })
  })

  describe('second tab', () => {
    test('should not be interrupted by a second tab that loads the application', async () => {
      await using session = await sut.open()

      const second = await commands.prepareCameraInSecondTab({ facing: 'back', resolution: small })

      // the second tab answers from what this tab remembered and starts nothing
      expect(second.selected).toBe(session.descriptor.id)
      expect(second.permission).toBe('unknown')
      expect(second.error).toBeUndefined()
      expect(session.state).toBe('live')
      expect(session.track.readyState).toBe('live')
    })

    test('should let a second tab that loads later use what this tab found out', async () => {
      await sut.list({ detail: 'probed' })
      const known = (await sut.list()).length

      const second = await commands.prepareCameraInSecondTab({ facing: 'back' })
      await commands.showFirstTab()

      expect(second.permission).toBe('granted')
      expect(second.probed).toBe(known)
    })

    test('should give the camera to a second tab that takes it over', async () => {
      const session = await sut.open()
      const ends: MediaSessionEnd[] = []
      session.on('ended', (end) => ends.push(end))

      const second = await commands.openCameraInSecondTab({ whenBusy: 'takeover' })

      expect(second).toEqual({ isOpen: true })
      expect(session.state).toBe('ended')
      expect(ends).toEqual([{ reason: 'taken-over' }])
    })

    test('should keep the camera from a second tab while the application does not allow a take-over', async () => {
      await using session = await sut.open()
      session.allowTakeover = false

      const second = await commands.openCameraInSecondTab({ whenBusy: 'takeover' })

      expect(second).toEqual({ isOpen: false, error: 'MediaDeviceBusyError', holder: 'other-tab' })
      expect(session.state).toBe('live')
    })

    test('should wait for the second tab to close its session', async () => {
      await commands.openCameraInSecondTab({ whenBusy: 'fail' })

      const opening = sut.open({ whenBusy: 'wait' })
      await commands.closeCameraInSecondTab()
      await commands.showFirstTab()

      await using session = await opening
      expect(session.state).toBe('live')
    })
  })
})
