import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import type { StorageManager } from '../../../storage/storage-manager.ts'
import type { Store } from '../../../storage/store/store.ts'
import { FakeStorageBrowser } from '../../../storage/testing/fake-storage-browser.ts'
import { useStoredValue } from './use-stored-value.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

describe('use-stored-value', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  let browser!: FakeStorageBrowser
  let storage!: StorageManager
  let store!: Store<number>

  beforeEach(async () => {
    browser = new FakeStorageBrowser()
    storage = browser.openTab()
    store = await storage.open<number>({ driver: 'local', namespace: 'settings' })
  })

  afterEach(() => {
    browser.close()
  })

  test('should load the stored value', async () => {
    await store.set('volume', 7)

    const volume = within(() => useStoredValue(store, 'volume'))
    expect(volume.isLoaded.value).toBe(false)
    await waitFor(() => volume.isLoaded.value)

    expect(volume.value.value).toBe(7)
  })

  test('should have no value where there is no entry', async () => {
    const volume = within(() => useStoredValue(store, 'volume'))
    await waitFor(() => volume.isLoaded.value)

    expect(volume.value.value).toBeUndefined()
    expect(volume.error.value).toBeUndefined()
  })

  test('should write and follow its own write', async () => {
    const volume = within(() => useStoredValue(store, 'volume'))

    await volume.set(3)
    await waitFor(() => volume.value.value === 3)

    expect(volume.value.value).toBe(3)
    expect(await store.get('volume')).toBe(3)
  })

  test('should build on the current value', async () => {
    const volume = within(() => useStoredValue(store, 'volume'))
    await volume.set(3)

    await volume.update((current) => (current ?? 0) + 1)
    await waitFor(() => volume.value.value === 4)

    expect(volume.value.value).toBe(4)
  })

  test('should remove the entry', async () => {
    const volume = within(() => useStoredValue(store, 'volume'))
    await volume.set(3)

    await volume.remove()
    await waitFor(() => volume.value.value === undefined)

    expect(volume.value.value).toBeUndefined()
    expect(await store.has('volume')).toBe(false)
  })

  test('should follow a write of another tab', async () => {
    const volume = within(() => useStoredValue(store, 'volume'))
    const other = await browser.openTab().open<number>({ driver: 'local', namespace: 'settings' })

    await other.set('volume', 9)
    await waitFor(() => volume.value.value === 9)

    expect(volume.value.value).toBe(9)
  })

  test('should ignore the other entries of the store', async () => {
    const volume = within(() => useStoredValue(store, 'volume'))
    await volume.set(3)
    await waitFor(() => volume.value.value === 3)

    await store.set('brightness', 5)
    await flush()

    expect(volume.value.value).toBe(3)
  })

  test('should put a failure into the state instead of throwing', async () => {
    const volume = within(() => useStoredValue(store, 'volume'))
    const failure = new Error('full')

    await volume.update(() => {
      throw failure
    })

    expect(volume.error.value).toBe(failure)
  })

  test('should stop following when the component is unmounted', async () => {
    const volume = within(() => useStoredValue(store, 'volume'))
    await volume.set(3)
    await waitFor(() => volume.value.value === 3)

    scope.stop()
    await store.set('volume', 4)
    await flush()
    await flush()

    expect(volume.value.value).toBe(3)
  })
})
