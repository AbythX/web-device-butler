import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'
import { DefaultDeviceOrientation } from '../../../platform/default-device-orientation.ts'
import { renderHook } from '../testing/render-hook.ts'
import { useOrientation } from './use-orientation.ts'

describe('useOrientation', () => {
  test('should follow how the device is held', async () => {
    const list = Object.assign(new FakeEventTarget(), { matches: true })
    const window = { matchMedia: () => list }

    const orientation = new DefaultDeviceOrientation(
      BrowserEnvironment.of({ window, document: {} } as object),
      new NullLogger()
    )

    const hook = await renderHook(() => useOrientation(orientation))
    expect(hook.result.current).toBe('portrait')

    await hook.act(() => {
      list.matches = false
      list.dispatch('change', { matches: false })
    })

    expect(hook.result.current).toBe('landscape')

    await hook.unmount()
    expect(list.listenerCount()).toBe(0)
  })
})
