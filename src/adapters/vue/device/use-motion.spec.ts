import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'
import { DefaultDeviceMotion } from '../../../motion/default-device-motion.ts'
import { useAttitude, useMovement } from './use-motion.ts'

describe('use-motion', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope
  let window!: FakeEventTarget
  let motion!: DefaultDeviceMotion

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    scope = effectScope()
    window = new FakeEventTarget()
    motion = new DefaultDeviceMotion(
      BrowserEnvironment.of({
        window: window as unknown as Window,
        document: {} as Document,
        DeviceOrientationEvent: { prototype: {} },
        DeviceMotionEvent: { prototype: {} },
      }),
      new NullLogger(),
      { unavailableAfter: 10 }
    )
  })

  afterEach(() => {
    scope.stop()
    motion.dispose()
  })

  test('should read nothing before it is started', () => {
    const attitude = within(() => useAttitude(motion))

    expect(attitude.isWatching.value).toBe(false)
    expect(window.listenerCount()).toBe(0)
  })

  test('should follow how the device is turned', () => {
    const attitude = within(() => useAttitude(motion))

    attitude.start()
    window.dispatch('deviceorientation', { alpha: 0, beta: 30, gamma: 0 })

    expect(attitude.isWatching.value).toBe(true)
    expect(attitude.value.value?.pitch).toBeCloseTo(30)
    expect(attitude.isAvailable.value).toBe(true)
  })

  test('should say that the device reports nothing', () => {
    const movement = within(() => useMovement(motion))

    movement.start()
    window.dispatch('devicemotion', { acceleration: null, accelerationIncludingGravity: null, rotationRate: null })

    expect(movement.isAvailable.value).toBe(false)
  })

  test('should put a failure into the state instead of throwing', () => {
    const unsupported = new DefaultDeviceMotion(BrowserEnvironment.of({}), new NullLogger())
    const attitude = within(() => useAttitude(unsupported))

    attitude.start()

    expect((attitude.error.value as Error).name).toBe('UnsupportedError')
    expect(attitude.isWatching.value).toBe(false)
  })

  test('should stop the watch when the component is unmounted', () => {
    const attitude = within(() => useAttitude(motion))
    attitude.start()

    scope.stop()

    expect(window.listenerCount()).toBe(0)
  })
})
