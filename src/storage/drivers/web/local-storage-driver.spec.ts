import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { FakeStorage } from '../../../core/testing/fake-storage.ts'
import { StorageDriverContract } from '../../testing/storage-driver-contract.ts'
import { LocalStorageDriver } from './local-storage-driver.ts'

describe('local-storage-driver', () => {
  StorageDriverContract.run(() => new LocalStorageDriver(BrowserEnvironment.of({ localStorage: new FakeStorage() })))

  test('should describe a string driver that is shared by the origin', async () => {
    const { capabilities, name } = new LocalStorageDriver(BrowserEnvironment.of({}))

    expect(name).toBe('local')
    expect(capabilities).toEqual({
      driver: 'local',
      persistence: 'origin',
      binary: false,
      streaming: false,
      crossTabEvents: true,
      consistentAcrossTabs: false,
    })
  })

  test('should use the localStorage and not the sessionStorage', async () => {
    const localStorage = new FakeStorage()
    const sessionStorage = new FakeStorage()
    const sut = new LocalStorageDriver(BrowserEnvironment.of({ localStorage, sessionStorage }))

    await sut.write('namespace', 'key', 'value')

    expect(localStorage.length).toBe(1)
    expect(sessionStorage.length).toBe(0)
  })
})
