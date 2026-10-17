import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultDeviceButler } from '../../core/default-device-butler.ts'
import type { DeviceButler } from '../../core/device-butler.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { inAnswerToAClick } from '../../core/testing/in-answer-to-a-click.ts'
import { MediaError } from '../errors/media-error.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import type { ScreenCaptureSession } from './session/screen-capture-session.ts'

/**
 * Whether the browser of the specs can capture the screen. The WebKit build of Playwright cannot.
 */
const canCapture = typeof navigator.mediaDevices?.getDisplayMedia === 'function'

/**
 * These specs run in real browsers. Chromium answers its picker itself with the whole screen (`--use-fake-ui-for-media-
 * stream`), also without a click. Firefox shares the whole screen without asking, but only in answer to a click, and
 * does not say what was shared. So the specs ask for what holds in both: what the library says a browser can do is
 * what it then does, and what a browser refuses arrives as an error of the library.
 */
describe('the capture of the screen in a real browser', () => {
  let butler!: DeviceButler

  const capture = async (requirements?: Parameters<DeviceButler['screenCapture']['open']>[0]) =>
    inAnswerToAClick(() => butler.screenCapture.open(requirements))

  beforeEach(async () => {
    await commands.showFirstTab()
    butler = DefaultDeviceButler.create()
  })

  afterEach(async () => {
    await butler.dispose()
  })

  test.skipIf(canCapture)('should refuse where the browser cannot capture the screen', async () => {
    expect(butler.screenCapture.isSupported).toBe(false)
    expect(await capture()).toBeInstanceOf(UnsupportedError)
  })

  describe.skipIf(!canCapture)('where the browser can capture the screen', () => {
    test('should capture the screen and stop it when it is closed', async () => {
      const outcome = await capture()

      expect(butler.screenCapture.isSupported).toBe(true)
      expect(outcome).not.toBeInstanceOf(Error)

      const session = outcome as ScreenCaptureSession
      expect(session.state).toBe('live')
      expect(session.track.kind).toBe('video')
      expect(session.track.readyState).toBe('live')
      expect(session.settings.width).toBeGreaterThan(0)
      expect([undefined, 'monitor', 'window', 'browser']).toContain(session.surface)

      await session.close()

      expect(session.state).toBe('ended')
      expect(session.stream.getTracks().map((track) => track.readyState)).not.toContain('live')
    })

    test('should either capture outside a click, or say that a click is needed', async () => {
      const outcome = await butler.screenCapture.open().catch((error: unknown) => error)

      const answer = outcome instanceof MediaError ? outcome.message : (outcome as ScreenCaptureSession).state

      expect(answer).toMatch(/^live$|in answer to a click/)
    })

    test('should stop a capture of another surface than the required one, where the browser says what it is', async () => {
      const outcome = await capture({ require: { surface: 'window' } })

      // the browser does not say what was shared, or the user did choose a window
      const answer =
        outcome instanceof MediaRequirementsError
          ? outcome.constraint
          : ((outcome as ScreenCaptureSession).surface ?? 'not reported')

      expect(['surface', 'window', 'not reported']).toContain(answer)
    })

    test('should record the screen together with a microphone', async () => {
      await using screen = (await capture()) as ScreenCaptureSession
      await using microphone = await butler.microphone.open()
      using joined = butler.media.join(screen, microphone)

      expect(joined.stream.getVideoTracks()).toHaveLength(1)
      expect(joined.stream.getAudioTracks().length).toBeGreaterThanOrEqual(1)

      const recording = await butler.recorder.record(joined, { interval: 100 })
      await new Promise((resolve) => setTimeout(resolve, 500))
      const result = await recording.stop()

      expect(result.mimeType).toMatch(/^video\//)
      expect(result.bytes).toBeGreaterThan(0)
    })
  })
})
