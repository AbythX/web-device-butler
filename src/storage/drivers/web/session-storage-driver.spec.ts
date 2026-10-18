import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { FakeStorage } from '../../../core/testing/fake-storage.ts'
import { StorageDriverContract } from '../../testing/storage-driver-contract.ts'
import { SessionStorageDriver } from './session-storage-driver.ts'

describe('session-storage-driver', () => {
  StorageDriverContract.run(
    () => new SessionStorageDriver(BrowserEnvironment.of({ sessionStorage: new FakeStorage() }))
  )

  test('should describe a string driver that lives as long as the tab', async () => {
    const { capabilities, name } = new SessionStorageDriver(BrowserEnvironment.of({}))

    expect(name).toBe('session')
    expect(capabilities).toEqual({
      driver: 'session',
      persistence: 'tab',
      binary: false,
      streaming: false,
      crossTabEvents: false,
      consistentAcrossTabs: true,
    })
  })

  test('should use the sessionStorage and not the localStorage', async () => {
    const localStorage = new FakeStorage()
    const sessionStorage = new FakeStorage()
    const sut = new SessionStorageDriver(BrowserEnvironment.of({ localStorage, sessionStorage }))

    await sut.write('namespace', 'key', 'value')

    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(1)
  })
})
