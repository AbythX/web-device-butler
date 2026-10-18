import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { StorageSupport } from './storage-support.ts'

describe('storage-support', () => {
  // SAFETY: the support only checks that the call is there
  const storage = { persist: () => Promise.resolve(true) } as unknown as StorageManager
  const navigator = { storage } as Navigator

  test('should hand out the storage manager on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ navigator })

    expect(StorageSupport.canPersistIn(environment)).toBe(true)
    expect(StorageSupport.resolveFor(environment)).toBe(storage)
  })

  test('should not ask the browser outside a secure context', async () => {
    const environment = BrowserEnvironment.of({ navigator, isSecureContext: false })

    expect(StorageSupport.canPersistIn(environment)).toBe(false)
    expect(StorageSupport.resolveFor(environment)).toBeUndefined()
  })

  test('should not persist where the browser cannot be asked', async () => {
    expect(StorageSupport.canPersistIn(BrowserEnvironment.of({ navigator: { storage: {} } as Navigator }))).toBe(false)
    expect(StorageSupport.canPersistIn(BrowserEnvironment.of({ navigator: {} as Navigator }))).toBe(false)
  })
})
