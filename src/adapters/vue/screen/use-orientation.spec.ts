import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { DefaultDeviceOrientation } from '../../../platform/default-device-orientation.ts'
import { useOrientation } from './use-orientation.ts'

describe('use-orientation', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  test('should follow how the device is held', async () => {
    const listeners = new Set<(event: { matches: boolean }) => void>()

    const window = {
      matchMedia: () => ({
        matches: true,
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
          listeners.delete(listener),
      }),
    } as unknown as Window

    const orientation = new DefaultDeviceOrientation(
      BrowserEnvironment.of({ window, document: {} as Document }),
      new NullLogger()
    )

    const current = within(() => useOrientation(orientation))
    expect(current.value).toBe('portrait')

    listeners.forEach((listener) => listener({ matches: false }))
    expect(current.value).toBe('landscape')

    scope.stop()
    expect(listeners.size).toBe(0)
  })

  test('should not know where there is no page', async () => {
    const orientation = new DefaultDeviceOrientation(BrowserEnvironment.of({}), new NullLogger())

    expect(within(() => useOrientation(orientation)).value).toBeUndefined()
  })
})
