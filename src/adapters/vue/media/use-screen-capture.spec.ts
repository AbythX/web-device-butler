import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { NullLogger } from '../../../core/logging/null-logger.ts'
import { DefaultScreenCaptureManager } from '../../../media/screen-capture/default-screen-capture-manager.ts'
import { FakeMediaBrowser } from '../../../media/testing/fake-media-browser.ts'
import { FakeMediaDevices } from '../../../media/testing/fake-media-devices.ts'
import type { FakeMediaStreamTrack } from '../../../media/testing/fake-media-stream-track.ts'
import { useScreenCapture } from './use-screen-capture.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const fake = (session: { track: MediaStreamTrack } | undefined) => session?.track as unknown as FakeMediaStreamTrack

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

describe('use-screen-capture', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  let browser!: FakeMediaBrowser
  let manager!: DefaultScreenCaptureManager

  beforeEach(() => {
    scope = effectScope()
    browser = new FakeMediaBrowser({ inputs: FakeMediaDevices.desktop() })
    browser.devices.displayChoice = { surface: 'window', width: 1280, height: 720 }
    manager = new DefaultScreenCaptureManager({}, browser.openEnvironment(), new NullLogger(), {
      settingsInterval: 1,
    })
  })

  afterEach(async () => {
    scope.stop()
    await manager.dispose()
    await flush()
    browser.close()
    browser.devices.assertNothingRuns()
  })

  test('should capture the screen and follow what it delivers', async () => {
    const capture = within(() => useScreenCapture(manager))

    const session = await capture.open({ prefer: { surface: 'window' } })

    expect(capture.session.value).toBe(session)
    expect(capture.state.value).toBe('live')
    expect(capture.settings.value?.surface).toBe('window')

    fake(session).resize(800, 600)
    await waitFor(() => capture.settings.value?.width === 800)

    expect(capture.settings.value?.height).toBe(600)
  })

  test('should say that the user stopped sharing', async () => {
    const capture = within(() => useScreenCapture(manager))
    const session = await capture.open()

    fake(session).end()
    await waitFor(() => capture.ended.value !== undefined)

    expect(capture.session.value).toBeUndefined()
    expect(capture.ended.value).toEqual({ reason: 'device' })
  })

  test('should put a cancelled picker into the state instead of throwing', async () => {
    browser.devices.displayChoice = 'cancel'
    const capture = within(() => useScreenCapture(manager))

    expect(await capture.open()).toBeUndefined()
    expect((capture.error.value as Error).name).toBe('PermissionDeniedError')
  })

  test('should stop the capture when the component is unmounted', async () => {
    const capture = within(() => useScreenCapture(manager))
    const session = await capture.open()

    scope.stop()
    await flush()

    expect(session?.state).toBe('ended')
  })
})
