import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'
import { DefaultDeviceMotion } from '../../../motion/default-device-motion.ts'
import { renderHook } from '../testing/render-hook.ts'
import { useAttitude } from './use-motion.ts'

/**
 * The hook runs against a fake window: the browsers of the specs have no sensors.
 */
describe('useAttitude', () => {
  let window!: FakeEventTarget
  let motion!: DefaultDeviceMotion

  beforeEach(() => {
    window = new FakeEventTarget()
    motion = new DefaultDeviceMotion(
      BrowserEnvironment.of({
        window: window as unknown as Window,
        document,
        DeviceOrientationEvent: { prototype: {} },
      }),
      new NullLogger()
    )
  })

  afterEach(() => {
    motion.dispose()
  })

  test('should follow how the device is turned, and stop on unmount', async () => {
    const hook = await renderHook(() => useAttitude(motion))

    await hook.act(async () => {
      hook.result.current.start()
      window.dispatch('deviceorientation', { alpha: 0, beta: 0, gamma: 20 })
    })

    expect(hook.result.current.isWatching).toBe(true)
    expect(hook.result.current.value?.roll).toBeCloseTo(20)

    await hook.unmount()

    expect(window.listenerCount()).toBe(0)
  })
})
