import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { DefaultStorageManager } from '../../../storage/default-storage-manager.ts'
import { renderHook } from '../testing/render-hook.ts'
import { waitFor } from '../testing/wait-for.ts'
import { useStoredValue } from './use-stored-value.ts'

describe('useStoredValue', () => {
  test('should follow the entry of a store, also when something else writes it', async () => {
    using storage = DefaultStorageManager.create({}, BrowserEnvironment.of({}))
    const store = await storage.open<number>({ namespace: 'counters', driver: 'memory' })
    await store.set('visits', 1)

    const hook = await renderHook(() => useStoredValue(store, 'visits'))
    await waitFor(() => hook.result.current.isLoaded)
    expect(hook.result.current.value).toBe(1)

    await hook.act(() => hook.result.current.update((visits = 0) => visits + 1))
    await waitFor(() => hook.result.current.value === 2)
    expect(hook.result.current.value).toBe(2)

    await hook.act(() => store.set('visits', 10))
    await waitFor(() => hook.result.current.value === 10)
    expect(hook.result.current.value).toBe(10)

    await hook.act(() => hook.result.current.remove())
    await waitFor(() => hook.result.current.value === undefined)
    expect(hook.result.current.value).toBeUndefined()

    await hook.unmount()
  })
})
