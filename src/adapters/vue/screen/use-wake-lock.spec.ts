import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../../core/errors/unsupported-error.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'
import { DefaultScreenWakeLock } from '../../../screen/wake-lock/default-screen-wake-lock.ts'
import { useWakeLock } from './use-wake-lock.ts'

class FakeSentinel extends FakeEventTarget {
  public async release(): Promise<void> {
    this.dispatch('release')
  }
}

describe('use-wake-lock', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope
  let sentinels!: FakeSentinel[]
  let wakeLock!: DefaultScreenWakeLock

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    scope = effectScope()
    sentinels = []

    const navigator = {
      wakeLock: {
        request: async () => {
          const sentinel = new FakeSentinel()
          sentinels.push(sentinel)

          return sentinel
        },
      },
    }

    wakeLock = new DefaultScreenWakeLock(BrowserEnvironment.of({ navigator } as object), new NullLogger())
  })

  afterEach(() => {
    scope.stop()
  })

  test('should keep the screen on until it is released', async () => {
    const state = within(() => useWakeLock(wakeLock))
    expect(state.isActive.value).toBe(false)

    await state.request()
    expect(state.isActive.value).toBe(true)
    expect(state.isRequested.value).toBe(true)

    state.release()
    expect(state.isActive.value).toBe(false)
    expect(state.isRequested.value).toBe(false)
  })

  test('should hold the screen once however often it is asked', async () => {
    const state = within(() => useWakeLock(wakeLock))

    await Promise.all([state.request(), state.request()])
    state.release()

    expect(wakeLock.isRequested).toBe(false)
  })

  test('should not let the screen sleep while another part of the application needs it', async () => {
    const other = await wakeLock.request()
    const state = within(() => useWakeLock(wakeLock))
    await state.request()

    state.release()

    expect(state.isActive.value).toBe(true)
    other.release()
    expect(state.isActive.value).toBe(false)
  })

  test('should release its hold when the component is unmounted', async () => {
    const state = within(() => useWakeLock(wakeLock))
    await state.request()

    scope.stop()

    expect(wakeLock.isRequested).toBe(false)
  })

  test('should give back a hold that arrives after the component was unmounted', async () => {
    const state = within(() => useWakeLock(wakeLock))
    const requested = state.request()

    scope.stop()
    await requested

    expect(wakeLock.isRequested).toBe(false)
    expect(state.isRequested.value).toBe(false)
  })

  test('should say why the screen cannot be kept on', async () => {
    const unsupported = new DefaultScreenWakeLock(BrowserEnvironment.of({}), new NullLogger())
    const state = within(() => useWakeLock(unsupported))

    await state.request()

    expect(state.error.value).toBeInstanceOf(UnsupportedError)
    expect(state.isRequested.value).toBe(false)
  })
})
