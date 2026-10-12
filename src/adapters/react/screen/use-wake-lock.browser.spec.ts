import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../../core/errors/unsupported-error.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'
import { DefaultScreenWakeLock } from '../../../screen/wake-lock/default-screen-wake-lock.ts'
import { renderHook } from '../testing/render-hook.ts'
import { useWakeLock } from './use-wake-lock.ts'

describe('useWakeLock', () => {
  const sentinel = () => {
    const target = new FakeEventTarget()

    return Object.assign(target, { release: async () => target.dispatch('release') })
  }

  test('should keep the screen on until it is released', async () => {
    const navigator = { wakeLock: { request: async () => sentinel() } }
    const wakeLock = new DefaultScreenWakeLock(BrowserEnvironment.of({ navigator } as object), new NullLogger())

    const hook = await renderHook(() => useWakeLock(wakeLock))
    expect(hook.result.current.isActive).toBe(false)

    await hook.act(() => hook.result.current.request())
    expect(hook.result.current.isActive).toBe(true)
    expect(hook.result.current.isRequested).toBe(true)

    await hook.act(() => hook.result.current.release())
    expect(hook.result.current.isActive).toBe(false)
    expect(hook.result.current.isRequested).toBe(false)
  })

  test('should release its hold when the component is unmounted', async () => {
    const navigator = { wakeLock: { request: async () => sentinel() } }
    const wakeLock = new DefaultScreenWakeLock(BrowserEnvironment.of({ navigator } as object), new NullLogger())
    const hook = await renderHook(() => useWakeLock(wakeLock))
    await hook.act(() => hook.result.current.request())

    await hook.unmount()

    expect(wakeLock.isRequested).toBe(false)
  })

  test('should say why the screen cannot be kept on', async () => {
    const hook = await renderHook(() =>
      useWakeLock(new DefaultScreenWakeLock(BrowserEnvironment.of({}), new NullLogger()))
    )

    await hook.act(() => hook.result.current.request())

    expect(hook.result.current.error).toBeInstanceOf(UnsupportedError)
    expect(hook.result.current.isRequested).toBe(false)
  })
})
