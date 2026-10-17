import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { NullLogger } from '../../../core/logging/null-logger.ts'
import { DefaultScreenCaptureManager } from '../../../media/screen-capture/default-screen-capture-manager.ts'
import { FakeMediaBrowser } from '../../../media/testing/fake-media-browser.ts'
import { FakeMediaDevices } from '../../../media/testing/fake-media-devices.ts'
import type { FakeMediaStreamTrack } from '../../../media/testing/fake-media-stream-track.ts'
import { renderHook } from '../testing/render-hook.ts'
import { waitFor } from '../testing/wait-for.ts'
import { useScreenCapture } from './use-screen-capture.ts'

const fake = (session: { track: MediaStreamTrack } | undefined) => session?.track as unknown as FakeMediaStreamTrack

/**
 * A real picker cannot be answered from a spec in every browser, so the hook runs against the fake devices; the
 * capture itself is covered by the specs of the screen capture in a real browser.
 */
describe('useScreenCapture', () => {
  let browser!: FakeMediaBrowser
  let manager!: DefaultScreenCaptureManager

  beforeEach(() => {
    browser = new FakeMediaBrowser({ inputs: FakeMediaDevices.desktop() })
    browser.devices.displayChoice = { surface: 'browser', width: 1280, height: 720 }
    manager = new DefaultScreenCaptureManager({}, browser.openEnvironment(), new NullLogger(), {
      settingsInterval: 1,
    })
  })

  afterEach(async () => {
    await manager.dispose()
    browser.close()
  })

  test('should capture the screen, follow it and stop it on unmount', async () => {
    const hook = await renderHook(() => useScreenCapture(manager))
    expect(hook.result.current.session).toBeUndefined()

    await hook.act(() => hook.result.current.open())

    const session = hook.result.current.session
    expect(hook.result.current.state).toBe('live')
    expect(hook.result.current.settings?.surface).toBe('browser')

    await hook.act(async () => {
      fake(session).resize(800, 600)
      await waitFor(async () => hook.result.current.settings?.width === 800)
    })

    expect(hook.result.current.settings?.height).toBe(600)

    await hook.unmount()

    expect(session?.state).toBe('ended')
  })

  test('should say that the user stopped sharing', async () => {
    const hook = await renderHook(() => useScreenCapture(manager))
    await hook.act(() => hook.result.current.open())

    await hook.act(async () => {
      fake(hook.result.current.session).end()
      await waitFor(async () => hook.result.current.ended !== undefined)
    })

    expect(hook.result.current.session).toBeUndefined()
    expect(hook.result.current.ended).toEqual({ reason: 'device' })

    await hook.unmount()
  })
})
