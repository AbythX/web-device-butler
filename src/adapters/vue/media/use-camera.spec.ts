import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import type { CameraManager } from '../../../media/camera/camera-manager.ts'
import { CameraTestBench } from '../../../media/camera/testing/camera-test-bench.ts'
import { FakeMediaBrowser } from '../../../media/testing/fake-media-browser.ts'
import type { FakeMediaStreamTrack } from '../../../media/testing/fake-media-stream-track.ts'
import { useCamera } from './use-camera.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const fake = (session: { track: MediaStreamTrack } | undefined) => session?.track as unknown as FakeMediaStreamTrack

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

describe('use-camera', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  let browser!: FakeMediaBrowser
  let manager!: CameraManager

  beforeEach(() => {
    browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
    manager = CameraTestBench.load(browser)
  })

  afterEach(async () => {
    manager.dispose()
    await flush()
    browser.close()
    browser.devices.assertNothingRuns()
  })

  test('should have no session before one was opened', async () => {
    const camera = within(() => useCamera(manager))

    expect(camera.session.value).toBeUndefined()
    expect(camera.state.value).toBeUndefined()
    expect(camera.isOpening.value).toBe(false)
    expect(browser.devices.calls).toEqual([])
  })

  test('should open a session and expose it as state', async () => {
    const camera = within(() => useCamera(manager))

    const opening = camera.open({ require: { facing: 'back', torch: true } })
    expect(camera.isOpening.value).toBe(true)
    const session = await opening

    expect(camera.session.value).toBe(session)
    expect(camera.state.value).toBe('live')
    expect(camera.isOpening.value).toBe(false)
    expect(camera.descriptor.value?.id).toBe('back-main')
    expect(camera.settings.value?.resolution?.toString()).toBe('640x480')
    expect(camera.error.value).toBeUndefined()
  })

  test('should put a failure into the state instead of throwing', async () => {
    const camera = within(() => useCamera(manager))

    const session = await camera.open({ require: { facing: 'front', torch: true } })

    expect(session).toBeUndefined()
    expect(camera.session.value).toBeUndefined()
    expect((camera.error.value as Error).name).toBe('MediaRequirementsError')
    expect(camera.isOpening.value).toBe(false)
  })

  test('should clear the failure with the next attempt', async () => {
    const camera = within(() => useCamera(manager))
    await camera.open({ id: 'gone' })

    await camera.open({ require: { facing: 'back' } })

    expect(camera.error.value).toBeUndefined()
  })

  test('should follow the camera and its settings', async () => {
    const camera = within(() => useCamera(manager))
    const session = await camera.open({ require: { facing: 'back', torch: true } })

    await session?.configure({ width: 1280, height: 720 })
    expect(camera.settings.value?.resolution?.toString()).toBe('1280x720')

    await session?.switchTo({ require: { facing: 'front' } })
    expect(camera.descriptor.value?.facing).toBe('front')
  })

  test('should follow the state of the session', async () => {
    const camera = within(() => useCamera(manager))
    const session = await camera.open({ require: { facing: 'back' } })

    fake(session).mute()

    expect(camera.state.value).toBe('muted')
  })

  test('should forget a session that ended and say why', async () => {
    const camera = within(() => useCamera(manager))
    const session = await camera.open({ require: { facing: 'back' } })

    fake(session).end()
    await waitFor(() => camera.session.value === undefined)

    expect(camera.session.value).toBeUndefined()
    expect(camera.state.value).toBeUndefined()
    expect(camera.descriptor.value).toBeUndefined()
    expect(camera.ended.value).toEqual({ reason: 'device' })
  })

  test('should close the open session before it opens another one', async () => {
    const camera = within(() => useCamera(manager))
    const first = await camera.open({ require: { facing: 'back' } })

    const second = await camera.open({ require: { facing: 'front' } })

    expect(first?.state).toBe('ended')
    expect(camera.session.value).toBe(second)
    expect(camera.descriptor.value?.facing).toBe('front')
  })

  test('should close the session', async () => {
    const camera = within(() => useCamera(manager))
    const session = await camera.open({ require: { facing: 'back' } })

    await camera.close()

    expect(session?.state).toBe('ended')
    expect(camera.session.value).toBeUndefined()
    expect(camera.ended.value).toEqual({ reason: 'closed' })
  })

  test('should close the session when the component is unmounted', async () => {
    const camera = within(() => useCamera(manager))
    const session = await camera.open({ require: { facing: 'back' } })

    scope.stop()
    await flush()

    expect(session?.state).toBe('ended')
  })

  test('should close a session that opens after the component was unmounted', async () => {
    const camera = within(() => useCamera(manager))
    const opening = camera.open({ require: { facing: 'back' } })
    await waitFor(() => browser.devices.requests.length > 0)

    scope.stop()

    expect(await opening).toBeUndefined()
    expect(camera.session.value).toBeUndefined()
    expect(browser.devices.liveTracks).toEqual([])
  })

  test('should not open a session after the component was unmounted', async () => {
    const camera = within(() => useCamera(manager))
    scope.stop()

    expect(await camera.open({ require: { facing: 'back' } })).toBeUndefined()
    expect(browser.devices.calls).toEqual([])
  })
})
