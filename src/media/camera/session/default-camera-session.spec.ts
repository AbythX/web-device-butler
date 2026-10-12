import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import type { Logger } from '../../../core/logging/logger.ts'
import { MediaDeviceBusyError } from '../../errors/media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from '../../errors/media-device-not-found-error.ts'
import { MediaRequirementsError } from '../../errors/media-requirements-error.ts'
import { SessionClosedError } from '../../errors/session-closed-error.ts'
import type { MediaSessionEnd, MediaSessionState } from '../../session/media-session.ts'
import { FakeMediaBrowser } from '../../testing/fake-media-browser.ts'
import type { FakeMediaStreamTrack } from '../../testing/fake-media-stream-track.ts'
import type { CameraManager } from '../camera-manager.ts'
import type { CameraDescriptor } from '../model/camera-descriptor.ts'
import type { CameraRequirements } from '../model/camera-requirements.ts'
import type { CameraSettings } from '../model/camera-settings.ts'
import { CameraTestBench } from '../testing/camera-test-bench.ts'
import type { CameraSession } from './camera-session.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

const fakeTrackOf = (session: CameraSession) => session.track as unknown as FakeMediaStreamTrack

/** a page the user can look at or put in the background */
class FakeDocument {
  public visibilityState: 'visible' | 'hidden' = 'visible'
  private readonly listeners = new Set<() => void>()

  public addEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener)
  }

  public removeEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener)
  }

  public show(): void {
    this.visibilityState = 'visible'
    ;[...this.listeners].forEach((listener) => listener())
  }
}

const torchCamera: CameraRequirements = {
  require: { facing: 'back', torch: true },
  prefer: { width: 1920, height: 1080 },
}

describe('default-camera-session', () => {
  let browser!: FakeMediaBrowser
  let page!: FakeDocument
  let manager!: CameraManager
  let sut!: CameraSession

  const isLocked = async () =>
    (await browser.locks.query()).held?.some((lock) => lock.name === 'web-device-butler:camera') ?? false

  beforeEach(async () => {
    page = new FakeDocument()
    browser = new FakeMediaBrowser(
      { inputs: CameraTestBench.phone(), oneCameraAtATime: true, backNeedsFacingRequest: true },
      { window: {} as Window, document: page as unknown as Document }
    )
    manager = CameraTestBench.load(browser)
    sut = await manager.open(torchCamera)
  })

  afterEach(async () => {
    manager.dispose()
    await flush()

    browser.close()
    browser.devices.assertNothingRuns()
    browser.devices.assertNoViolations()
  })

  describe('#descriptor', () => {
    test('should describe the camera that runs, with what it can do', async () => {
      expect(sut.descriptor.id).toBe('back-main')
      expect(sut.descriptor.detail).toBe('probed')
      expect(sut.descriptor.features.torch).toBe(true)
    })
  })

  describe('#settings', () => {
    test('should report what the camera delivers', async () => {
      expect(sut.settings).toMatchObject({ width: 1920, height: 1080, frameRate: 30 })
    })
  })

  describe('settingschange', () => {
    const reopen = async (settingsInterval: number) => {
      await sut.close()
      manager.dispose()
      manager = CameraTestBench.load(browser, {}, { ...CameraTestBench.timing, settingsInterval })
      sut = await manager.open(torchCamera)
    }

    test('should notice that the phone was turned while someone listens', async () => {
      await reopen(1)
      const settings: CameraSettings[] = []
      sut.on('settingschange', (changed) => settings.push(changed))

      fakeTrackOf(sut).turn()
      await waitFor(() => settings.length > 0)

      expect(settings.map((changed) => changed.resolution?.toString())).toEqual(['1080x1920'])
    })

    test('should stop asking the camera once nobody listens', async () => {
      await reopen(1)
      const settings: CameraSettings[] = []
      const subscription = sut.on('settingschange', (changed) => settings.push(changed))

      subscription.unsubscribe()
      fakeTrackOf(sut).turn()
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(settings).toEqual([])
    })
  })

  describe('controls', () => {
    test('should only exist for what the camera has', async () => {
      const front = await (await sut.close(), manager.open({ id: 'front-0' }))

      expect(front.torch).toBeUndefined()
      expect(front.zoom).toBeUndefined()
      expect(front.focus).toBeUndefined()
    })

    describe('torch', () => {
      test('should switch the torch on and off', async () => {
        expect(sut.torch?.enabled).toBe(false)

        await sut.torch?.set(true)
        expect(sut.torch?.enabled).toBe(true)

        await sut.torch?.set(false)
        expect(sut.torch?.enabled).toBe(false)
      })

      test('should toggle and say what the torch is now', async () => {
        expect(await sut.torch?.toggle()).toBe(true)
        expect(await sut.torch?.toggle()).toBe(false)
      })

      test('should read the state from the camera and not remember it', async () => {
        await sut.torch?.set(true)

        // the system switched the torch off
        await sut.track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] })

        expect(sut.torch?.enabled).toBe(false)
      })

      test('should fail after the session was closed', async () => {
        const torch = sut.torch
        await sut.close()

        await expect(torch?.set(true)).rejects.toThrow(SessionClosedError)
      })
    })

    describe('zoom', () => {
      test('should report the range and the level of the camera', async () => {
        expect(sut.zoom?.range).toMatchObject({ min: 1, max: 8, step: 0.1 })
        expect(sut.zoom?.level).toBe(1)
      })

      test('should zoom', async () => {
        await sut.zoom?.set(2.5)

        expect(sut.zoom?.level).toBe(2.5)
      })

      test.each([
        [0, 1],
        [100, 8],
      ])('should move the level %d to the end of the range', async (level, expected) => {
        await sut.zoom?.set(level)

        expect(sut.zoom?.level).toBe(expected)
      })

      test('should zoom in and out by the step of the camera', async () => {
        expect(sut.zoom?.isMinimum).toBe(true)

        await sut.zoom?.increase()
        await sut.zoom?.increase(2)
        expect(sut.zoom?.level).toBe(1.3)
        expect(sut.zoom?.isMinimum).toBe(false)

        await sut.zoom?.decrease()
        expect(sut.zoom?.level).toBe(1.2)
      })

      test('should stop at the ends of the range', async () => {
        await sut.zoom?.decrease()
        expect(sut.zoom?.level).toBe(1)

        await sut.zoom?.increase(1000)
        expect(sut.zoom?.level).toBe(8)
        expect(sut.zoom?.isMaximum).toBe(true)
      })

      test('should keep the torch on while zooming', async () => {
        await sut.torch?.set(true)

        await sut.zoom?.set(3)

        expect(sut.torch?.enabled).toBe(true)
        expect(sut.zoom?.level).toBe(3)
      })

      test('should apply overlapping changes one after another', async () => {
        await Promise.all([sut.torch?.set(true), sut.zoom?.set(2), sut.zoom?.set(4), sut.torch?.set(false)])

        expect(fakeTrackOf(sut).overlappingChanges).toBe(1)
        expect(sut.zoom?.level).toBe(4)
        expect(sut.torch?.enabled).toBe(false)
      })
    })

    describe('focus', () => {
      test('should report the modes of the camera', async () => {
        expect(sut.focus?.modes).toEqual(['continuous', 'manual'])
        expect(sut.focus?.mode).toBeUndefined()
      })

      test('should change the mode', async () => {
        await sut.focus?.setMode('continuous')

        expect(sut.focus?.mode).toBe('continuous')
      })

      test('should refuse a mode the camera does not have', async () => {
        await expect(sut.focus?.setMode('single-shot')).rejects.toThrow(MediaRequirementsError)
        expect(fakeTrackOf(sut).applied).toEqual([])
      })

      test('should focus by hand, which switches to the manual mode', async () => {
        await sut.focus?.setDistance(2)

        expect(sut.focus?.distanceRange).toMatchObject({ min: 0.1, max: 10 })
        expect(sut.focus?.distance).toBe(2)
        expect(sut.focus?.mode).toBe('manual')
      })

      test('should move a distance to the end of the range', async () => {
        await sut.focus?.setDistance(50)

        expect(sut.focus?.distance).toBe(10)
      })
    })

    describe('on iOS', () => {
      beforeEach(async () => {
        await sut.close()
        browser.identity = { platform: 'iPhone' }
        manager.dispose()
        manager = CameraTestBench.load(browser)
        sut = await manager.open(torchCamera)
      })

      test('should switch the torch off before zooming and on again afterwards', async () => {
        await sut.torch?.set(true)
        const changes = fakeTrackOf(sut).applied.length

        await sut.zoom?.set(2)

        const applied = fakeTrackOf(sut)
          .applied.slice(changes)
          .map((constraints) => constraints.advanced?.[0])

        expect(applied).toEqual([{ torch: false }, { torch: false, zoom: 2 }, { torch: true, zoom: 2 }])
        expect(sut.torch?.enabled).toBe(true)
      })

      test('should zoom without touching a torch that is off', async () => {
        await sut.zoom?.set(2)

        expect(fakeTrackOf(sut).applied).toHaveLength(1)
      })
    })
  })

  describe('#configure', () => {
    test('should change the resolution of the running camera', async () => {
      await sut.configure({ width: 1280, height: 720 })

      expect(sut.settings.resolution?.toString()).toBe('1280x720')
      expect(sut.track.readyState).toBe('live')
    })

    test('should change the frame rate', async () => {
      await sut.configure({ frameRate: 60 })

      expect(sut.settings.frameRate).toBe(60)
      expect(sut.settings.resolution?.toString()).toBe('1920x1080')
    })

    test('should announce the new settings', async () => {
      const announced: CameraSettings[] = []
      sut.on('settingschange', (settings) => announced.push(settings))

      await sut.configure({ width: 1280, height: 720 })
      await sut.configure({ width: 1280, height: 720 })

      expect(announced).toHaveLength(1)
      expect(announced[0]?.resolution?.toString()).toBe('1280x720')
    })

    test('should deliver the closest the camera can do', async () => {
      await sut.configure({ width: 7680, height: 4320 })

      expect(sut.settings.resolution?.toString()).toBe('3840x2160')
    })

    test('should keep the torch and the zoom', async () => {
      await sut.torch?.set(true)
      await sut.zoom?.set(3)

      await sut.configure({ width: 1280, height: 720 })

      expect(sut.torch?.enabled).toBe(true)
      expect(sut.zoom?.level).toBe(3)
    })

    test('should fail after the session was closed', async () => {
      await sut.close()

      await expect(sut.configure({ frameRate: 60 })).rejects.toThrow(SessionClosedError)
    })
  })

  describe('#switchTo', () => {
    test('should continue with the other camera as the same session', async () => {
      const previous = sut.track

      await sut.switchTo({ require: { facing: 'front' } })

      expect(sut.descriptor.facing).toBe('front')
      expect(sut.track).not.toBe(previous)
      expect(sut.stream.getTracks()).toEqual([sut.track])
      expect(previous.readyState).toBe('ended')
      expect(sut.track.readyState).toBe('live')
      expect(sut.state).toBe('live')
    })

    test('should keep the fields of the requirements that the switch does not change', async () => {
      await sut.switchTo({ require: { facing: 'front' } })

      // the resolution the session was opened with, as far as the front camera can deliver it
      expect(sut.descriptor.id).toBe('front-0')
      expect(sut.settings.resolution?.toString()).toBe('1920x1080')
    })

    test('should replace the controls by those of the new camera', async () => {
      await sut.switchTo({ require: { facing: 'front' } })

      expect(sut.torch).toBeUndefined()
      expect(sut.zoom).toBeUndefined()

      await sut.switchTo({ require: { facing: 'back', torch: true } })

      expect(sut.torch).toBeDefined()
      await sut.torch?.set(true)
      expect(sut.torch?.enabled).toBe(true)
    })

    test('should announce the new camera and its settings', async () => {
      const cameras: CameraDescriptor[] = []
      const settings: CameraSettings[] = []
      sut.on('devicechange', (camera) => cameras.push(camera))
      sut.on('settingschange', (changed) => settings.push(changed))

      await sut.switchTo({ id: 'front-1' })

      expect(cameras.map((camera) => camera.id)).toEqual(['front-1'])
      expect(settings.map((changed) => changed.resolution?.toString())).toEqual(['1280x720'])
    })

    test('should be muted while it switches and not end the session', async () => {
      const states: MediaSessionState[] = []
      const ends: MediaSessionEnd[] = []
      sut.on('statechange', (state) => states.push(state))
      sut.on('ended', (end) => ends.push(end))

      await sut.switchTo({ require: { facing: 'front' } })

      expect(states).toEqual(['muted', 'live'])
      expect(ends).toEqual([])
    })

    test('should be live again after a switch that failed', async () => {
      const states: MediaSessionState[] = []
      sut.on('statechange', (state) => states.push(state))

      await expect(sut.switchTo({ id: 'gone' })).rejects.toThrow(MediaDeviceNotFoundError)

      expect(sut.state).toBe('live')
      expect(states).toEqual(['muted', 'live'])
    })

    test('should keep the torch and the zoom if it lands on the camera it had', async () => {
      await sut.torch?.set(true)
      await sut.zoom?.set(3)
      const previous = sut.track

      await sut.switchTo({ strategy: 'first' })

      expect(sut.track).not.toBe(previous)
      expect(sut.descriptor.id).toBe('back-main')
      expect(sut.torch?.enabled).toBe(true)
      expect(sut.zoom?.level).toBe(3)
    })

    test('should apply a change that is made during the switch to the new camera', async () => {
      await Promise.all([sut.switchTo({ require: { facing: 'front' } }), sut.configure({ frameRate: 15 })])

      expect(sut.descriptor.facing).toBe('front')
      expect(sut.settings.frameRate).toBe(15)
    })

    test('should hold the lock throughout', async () => {
      await sut.switchTo({ require: { facing: 'front' } })

      expect(await isLocked()).toBe(true)
      await expect(CameraTestBench.load(browser).open({ id: 'front-1' })).rejects.toMatchObject({ holder: 'other-tab' })
    })

    test('should switch to a camera by its id', async () => {
      await sut.switchTo({ id: 'back-wide' })

      expect(sut.descriptor.id).toBe('back-wide')
    })

    test('should not keep the id of an earlier switch', async () => {
      await sut.switchTo({ id: 'back-wide' })

      await sut.switchTo({ require: { facing: 'front' } })

      expect(sut.descriptor.facing).toBe('front')
    })

    test('should stay on its camera if no camera fits', async () => {
      const previous = sut.track

      await expect(sut.switchTo({ require: { facing: 'front', torch: true } })).rejects.toThrow(MediaRequirementsError)

      // the front cameras had to be looked at, which stopped the camera of the session
      expect(sut.descriptor.id).toBe('back-main')
      expect(sut.track).not.toBe(previous)
      expect(sut.track.readyState).toBe('live')
      expect(sut.state).toBe('live')
      expect(sut.torch).toBeDefined()
    })

    test('should keep the running track if the switch fails before a camera was stopped', async () => {
      const previous = sut.track

      await expect(sut.switchTo({ id: 'gone' })).rejects.toThrow(MediaDeviceNotFoundError)

      expect(sut.track).toBe(previous)
      expect(sut.track.readyState).toBe('live')
    })

    test('should end the session if it cannot return to its camera', async () => {
      const ends: MediaSessionEnd[] = []
      sut.on('ended', (end) => ends.push(end))
      browser.devices.beforeCall = ({ method }) => {
        if (method === 'getUserMedia') {
          throw new DOMException('Could not start video source', 'NotReadableError')
        }
      }

      await expect(sut.switchTo({ id: 'front-0' })).rejects.toThrow(MediaDeviceBusyError)

      expect(sut.state).toBe('ended')
      expect(ends).toEqual([{ reason: 'device' }])
      expect(await isLocked()).toBe(false)
    })

    test('should run switches one after another', async () => {
      await Promise.all([sut.switchTo({ id: 'front-0' }), sut.switchTo({ id: 'back-wide' })])

      expect(sut.descriptor.id).toBe('back-wide')
      expect(browser.devices.liveTracks).toHaveLength(1)
    })

    test('should fail after the session was closed', async () => {
      await sut.close()

      await expect(sut.switchTo({ require: { facing: 'front' } })).rejects.toThrow(SessionClosedError)
    })
  })

  describe('autoRecover', () => {
    const reopen = async (requirements: CameraRequirements, timing = CameraTestBench.timing, logger?: Logger) => {
      await sut.close()
      manager.dispose()
      manager = CameraTestBench.load(browser, {}, timing, logger)
      sut = await manager.open(requirements)
    }

    test('should end the session when the system ends the camera, by default', async () => {
      const ends: MediaSessionEnd[] = []
      sut.on('ended', (end) => ends.push(end))

      fakeTrackOf(sut).end()
      await waitFor(() => ends.length > 0)

      expect(ends).toEqual([{ reason: 'device' }])
      expect(sut.state).toBe('ended')
    })

    test('should start the camera again when the system ends it', async () => {
      await reopen({ ...torchCamera, autoRecover: true })
      const previous = sut.track
      const states: MediaSessionState[] = []
      sut.on('statechange', (state) => states.push(state))

      fakeTrackOf(sut).end()
      await waitFor(() => sut.track !== previous)

      expect(sut.state).toBe('live')
      expect(states).toEqual(['muted', 'live'])
      expect(sut.track.readyState).toBe('live')
      expect(sut.descriptor.id).toBe('back-main')
      expect(sut.settings.resolution?.toString()).toBe('1920x1080')
      expect(sut.torch).toBeDefined()
    })

    test('should continue with what was changed while the camera ran', async () => {
      await reopen({ ...torchCamera, autoRecover: true })
      await sut.configure({ width: 1280, height: 720 })
      const previous = sut.track

      fakeTrackOf(sut).end()
      await waitFor(() => sut.track !== previous)

      expect(sut.settings.resolution?.toString()).toBe('1280x720')
    })

    test('should continue with the torch and the zoom the camera had', async () => {
      await reopen({ ...torchCamera, autoRecover: true })
      await sut.torch?.set(true)
      await sut.zoom?.set(2)
      const previous = sut.track

      fakeTrackOf(sut).end()
      await waitFor(() => sut.track !== previous && sut.torch?.enabled === true)

      expect(sut.torch?.enabled).toBe(true)
      expect(sut.zoom?.level).toBe(2)
    })

    test('should wait until the user looks at the page again', async () => {
      await reopen({ ...torchCamera, autoRecover: true })
      const previous = sut.track
      page.visibilityState = 'hidden'

      fakeTrackOf(sut).end()
      await flush()
      await flush()

      expect(sut.state).toBe('muted')
      expect(sut.track).toBe(previous)
      expect(await isLocked()).toBe(true)

      page.show()
      await waitFor(() => sut.track !== previous)

      expect(sut.state).toBe('live')
    })

    test('should give the camera to another tab while it waits', async () => {
      await reopen({ ...torchCamera, autoRecover: true })
      page.visibilityState = 'hidden'
      fakeTrackOf(sut).end()
      await flush()

      const other = await CameraTestBench.load(browser).open({ ...torchCamera, whenBusy: 'takeover' })

      expect(sut.state).toBe('ended')
      expect(other.track.readyState).toBe('live')

      // looking at the page again does not start a camera for the session that ended
      page.show()
      await flush()
      expect(browser.devices.liveTracks).toHaveLength(1)
      await other.close()
    })

    test('should end the session if the camera does not start again', async () => {
      await reopen({ ...torchCamera, autoRecover: true })
      const ends: MediaSessionEnd[] = []
      sut.on('ended', (end) => ends.push(end))
      browser.devices.beforeCall = ({ method }) => {
        if (method === 'getUserMedia') {
          throw new DOMException('Could not start video source', 'NotReadableError')
        }
      }

      fakeTrackOf(sut).end()
      await waitFor(() => ends.length > 0)

      expect(ends).toEqual([{ reason: 'device' }])
      expect(await isLocked()).toBe(false)
    })

    test('should not start a camera again that ended right after it was started', async () => {
      const logger = mock<Logger>()
      await reopen(
        { ...torchCamera, autoRecover: true },
        { ...CameraTestBench.timing, recoverMinLifetime: 60_000 },
        logger
      )
      const requests = browser.devices.requests.length

      fakeTrackOf(sut).end()
      await waitFor(() => sut.state === 'ended')

      expect(sut.state).toBe('ended')
      expect(browser.devices.requests).toHaveLength(requests)
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not starting it again'))
    })

    test('should not start the camera again after the application closed the session', async () => {
      await reopen({ ...torchCamera, autoRecover: true })
      const requests = browser.devices.requests.length

      await sut.close()
      await flush()

      expect(browser.devices.requests).toHaveLength(requests)
    })
  })

  describe('#close', () => {
    test('should stop the camera and release the lock', async () => {
      const track = sut.track

      await sut.close()

      expect(track.readyState).toBe('ended')
      expect(sut.state).toBe('ended')
      expect(await isLocked()).toBe(false)
    })
  })
})
