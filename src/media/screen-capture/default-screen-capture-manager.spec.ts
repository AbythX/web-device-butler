import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { CaptureControllerLike } from '../../core/environment/display-media-like.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceBusyError } from '../errors/media-device-busy-error.ts'
import { MediaError } from '../errors/media-error.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { MediaSessionEnd } from '../session/media-session.ts'
import { FakeMediaBrowser } from '../testing/fake-media-browser.ts'
import { FakeMediaDevices } from '../testing/fake-media-devices.ts'
import type { FakeMediaStreamTrack } from '../testing/fake-media-stream-track.ts'
import { DefaultScreenCaptureManager } from './default-screen-capture-manager.ts'
import type { ScreenCaptureRequirements } from './model/screen-capture-requirements.ts'
import type { ScreenCaptureSettings } from './model/screen-capture-settings.ts'
import type { ScreenCaptureManager } from './screen-capture-manager.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const fake = (track: MediaStreamTrack) => track as unknown as FakeMediaStreamTrack

const error = (name: string) => new DOMException('The browser refused', name)

/** decides the focus the way the page asks, and records what it was asked */
class FakeCaptureController implements CaptureControllerLike {
  public static readonly behaviours: string[] = []
  public static refuses = false

  public setFocusBehavior(behavior: 'focus-captured-surface' | 'no-focus-change'): void {
    if (FakeCaptureController.refuses) {
      throw error('InvalidStateError')
    }

    FakeCaptureController.behaviours.push(behavior)
  }
}

describe('default-screen-capture-manager', () => {
  let browser!: FakeMediaBrowser
  let devices!: FakeMediaDevices
  /** what `navigator.userActivation` says */
  let activation!: { isActive: boolean }
  let sut!: ScreenCaptureManager

  const create = (configuration: ScreenCaptureRequirements = {}, environment = browser.openEnvironment()) =>
    new DefaultScreenCaptureManager(configuration, environment, new NullLogger(), { settingsInterval: 5 })

  const lastRequest = () => devices.displayRequests.at(-1)

  beforeEach(() => {
    FakeCaptureController.behaviours.splice(0)
    FakeCaptureController.refuses = false
    activation = { isActive: true }

    browser = new FakeMediaBrowser(
      { inputs: FakeMediaDevices.desktop() },
      {
        CaptureController: FakeCaptureController,
      }
    )
    browser.identity = { userActivation: activation } as Partial<Navigator>
    devices = browser.devices
    sut = create()
  })

  afterEach(async () => {
    await sut.dispose()
    browser.close()
    devices.assertNothingRuns()
    devices.assertNoViolations()
  })

  describe('#isSupported', () => {
    test('should be true where the browser can capture the screen', () => {
      expect(sut.isSupported).toBe(true)
    })

    test('should be false where the browser has no capture of the screen, as on a phone', async () => {
      const phone = create({}, BrowserEnvironment.of({ navigator: { mediaDevices: {} } as unknown as Navigator }))

      expect(phone.isSupported).toBe(false)
      await expect(phone.open()).rejects.toThrow(UnsupportedError)
    })

    test('should be false on a page that was not loaded over HTTPS', async () => {
      const insecure = create(
        {},
        BrowserEnvironment.of({ navigator: { mediaDevices: devices } as unknown as Navigator, isSecureContext: false })
      )

      expect(insecure.isSupported).toBe(false)
      await expect(insecure.open()).rejects.toThrow(UnsupportedError)
    })
  })

  describe('#open', () => {
    test('should capture what the user chose', async () => {
      devices.displayChoice = { surface: 'window', width: 1280, height: 720 }

      await using session = await sut.open()

      expect(session.state).toBe('live')
      expect(session.surface).toBe('window')
      expect(session.settings.width).toBe(1280)
      expect(session.settings.height).toBe(720)
      expect(session.settings.cursor).toBe(true)
    })

    test('should hold the picture as its track, also where the browser lists the sound first', async () => {
      devices.displayChoice = { surface: 'browser', audio: true }

      await using session = await sut.open({ prefer: { audio: true } })

      expect(session.track.kind).toBe('video')
      expect(session.audio?.kind).toBe('audio')
      expect(session.stream.getTracks()).toHaveLength(2)
    })

    test('should ask for nothing but the picture without requirements', async () => {
      await using session = await sut.open()

      expect(lastRequest()).toEqual({ video: true })
      expect(session.audio).toBeUndefined()
    })

    test('should ask the browser for what is preferred', async () => {
      await using _session = await sut.open({
        prefer: { surface: 'window', width: 1920, height: 1080, frameRate: 30, cursor: true, audio: true },
        excludeThisTab: true,
      })

      expect(lastRequest()).toEqual({
        video: {
          displaySurface: 'window',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
          cursor: 'always',
        },
        audio: true,
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
      })
    })

    test('should ask for what is required where nothing is preferred, and never exactly', async () => {
      await using _session = await sut.open({
        require: { surface: 'monitor', width: 1280 },
        prefer: { width: 1920, surface: undefined },
      })

      expect(lastRequest()?.video).toEqual({ displaySurface: 'monitor', width: { ideal: 1920 } })
    })

    test('should not let a preference that is switched off hide a requirement', async () => {
      devices.displayChoice = { surface: 'browser', audio: true }

      await using _session = await sut.open({ require: { audio: true }, prefer: { audio: false } })

      expect(lastRequest()?.audio).toBe(true)
    })

    test('should merge the call over the configuration, a field of the call replacing the configured one', async () => {
      sut = create({ prefer: { surface: 'window', audio: true }, excludeThisTab: true })

      await using _session = await sut.open({ prefer: { frameRate: 5 } })

      expect(lastRequest()).toEqual({ video: { frameRate: { ideal: 5 } }, selfBrowserSurface: 'exclude' })
    })

    test('should take changes of the configuration for the next calls', async () => {
      sut.configure({ prefer: { surface: 'browser' } })

      await using _session = await sut.open()

      expect(sut.configuration.prefer).toEqual({ surface: 'browser' })
      expect(lastRequest()?.video).toEqual({ displaySurface: 'browser' })
    })

    test('should tell the browser what is shared', async () => {
      await using session = await sut.open({ content: 'text' })

      expect(fake(session.track).contentHint).toBe('text')
    })
  })

  describe('what is required', () => {
    test('should stop a capture of another surface than the required one', async () => {
      devices.displayChoice = { surface: 'window' }

      const failure = await sut.open({ require: { surface: 'monitor' } }).catch((caught: unknown) => caught)

      expect(failure).toBeInstanceOf(MediaRequirementsError)
      expect((failure as MediaRequirementsError).constraint).toBe('surface')
      expect(devices.liveTracks).toEqual([])
    })

    test('should stop a capture without sound where sound is required', async () => {
      devices.displayChoice = { surface: 'window', audio: false }

      const failure = await sut.open({ require: { audio: true } }).catch((caught: unknown) => caught)

      expect(failure).toBeInstanceOf(MediaRequirementsError)
      expect((failure as Error).message).toContain('audio')
      expect(devices.liveTracks).toEqual([])
    })

    test('should name every requirement that is not met', async () => {
      devices.displayChoice = { surface: 'window', width: 800, height: 600 }

      const failure = await sut
        .open({ require: { surface: 'monitor', width: 1280, height: 720, audio: true } })
        .catch((caught: unknown) => caught)

      expect((failure as Error).message).toContain('surface, audio, width, height')
    })

    test('should keep a capture that has what is required', async () => {
      devices.displayChoice = { surface: 'monitor', audio: true, width: 2560, height: 1440 }

      await using session = await sut.open({ require: { surface: 'monitor', audio: true, width: 1920 } })

      expect(session.state).toBe('live')
    })

    test('should not hold against the capture what the browser does not report', async () => {
      devices.displayChoice = { surface: 'window', hidesSurface: true }

      await using session = await sut.open({ require: { surface: 'monitor', cursor: true } })

      expect(session.surface).toBeUndefined()
      expect(session.settings.cursor).toBeUndefined()
    })
  })

  describe('failures', () => {
    test('should report a picker the user cancelled as a refused permission', async () => {
      devices.displayChoice = 'cancel'

      const failure = await sut.open().catch((caught: unknown) => caught)

      expect(failure).toBeInstanceOf(PermissionDeniedError)
      expect((failure as PermissionDeniedError).permission).toBe('display-capture')
    })

    test.each(['InvalidStateError', 'InvalidAccessError'])(
      'should say that a click is needed when the browser throws %s',
      async (name) => {
        devices.displayError = error(name)

        const failure = await sut.open().catch((caught: unknown) => caught)

        expect(failure).toBeInstanceOf(MediaError)
        expect((failure as Error).message).toContain('in answer to a click')
        expect((failure as Error).cause).toBe(devices.displayError)
      }
    )

    test('should say that a click is needed when the browser refuses a page the user did not just use', async () => {
      activation.isActive = false
      devices.displayError = error('NotAllowedError')

      const failure = await sut.open().catch((caught: unknown) => caught)

      expect(failure).not.toBeInstanceOf(PermissionDeniedError)
      expect((failure as Error).message).toContain('in answer to a click')
    })

    test('should report a refusal right after a click as a refused permission', async () => {
      devices.displayError = error('NotAllowedError')

      await expect(sut.open()).rejects.toThrow(PermissionDeniedError)
    })

    test('should not report a system that refused as a device another tab holds', async () => {
      devices.displayError = error('NotReadableError')

      const failure = await sut.open().catch((caught: unknown) => caught)

      expect(failure).toBeInstanceOf(MediaError)
      expect(failure).not.toBeInstanceOf(MediaDeviceBusyError)
    })
  })

  describe('the focus', () => {
    test.each([
      ['keep-page', 'no-focus-change'],
      ['captured', 'focus-captured-surface'],
    ] as const)('should tell the browser to %s', async (focus, behaviour) => {
      await using _session = await sut.open({ focus })

      expect(lastRequest()?.controller).toBeInstanceOf(FakeCaptureController)
      expect(FakeCaptureController.behaviours).toEqual([behaviour])
    })

    test('should leave the focus to the browser where nothing is asked', async () => {
      await using _session = await sut.open()

      expect(lastRequest()?.controller).toBeUndefined()
    })

    test('should capture all the same where the browser does not take the focus behaviour', async () => {
      FakeCaptureController.refuses = true

      await using session = await sut.open({ focus: 'keep-page' })

      expect(session.state).toBe('live')
    })
  })

  describe('the session', () => {
    test('should end with the device when the user stops sharing, and stop the sound with it', async () => {
      devices.displayChoice = { surface: 'browser', audio: true }
      const session = await sut.open({ prefer: { audio: true } })
      const ends: MediaSessionEnd[] = []
      session.on('ended', (end) => ends.push(end))

      fake(session.track).end()
      await flush()

      expect(session.state).toBe('ended')
      expect(ends).toEqual([{ reason: 'device' }])
      expect(devices.liveTracks).toEqual([])
    })

    test('should stop every track when it is closed', async () => {
      devices.displayChoice = { surface: 'browser', audio: true }
      const session = await sut.open({ prefer: { audio: true } })

      await session.close()

      expect(devices.liveTracks).toEqual([])
    })

    test('should report a new size when the shared window is resized', async () => {
      const session = await sut.open()
      const changes: ScreenCaptureSettings[] = []
      session.on('settingschange', (settings) => changes.push(settings))

      fake(session.track).resize(800, 600)
      await new Promise((resolve) => setTimeout(resolve, 20))
      await session.close()

      expect(changes.map(({ width, height }) => [width, height])).toEqual([[800, 600]])
    })

    test('should ask for another size and frame rate while it runs', async () => {
      const session = await sut.open()

      await session.configure({ width: 1280, frameRate: 15 })

      expect(fake(session.track).applied.at(-1)).toEqual({ width: { ideal: 1280 }, frameRate: { ideal: 15 } })
      expect(session.settings.width).toBe(1280)
      await session.close()
      await expect(session.configure({ width: 640 })).rejects.toThrow(SessionClosedError)
    })
  })

  describe('#dispose', () => {
    test('should stop every capture and open no more', async () => {
      const first = await sut.open()
      const second = await sut.open()

      await sut.dispose()

      expect([first.state, second.state]).toEqual(['ended', 'ended'])
      expect(devices.liveTracks).toEqual([])
      await expect(sut.open()).rejects.toThrow(MediaError)
    })
  })
})
