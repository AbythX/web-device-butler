import { describe, expect, test } from 'vitest'

import { StorageDriverContract } from '../../testing/storage-driver-contract.ts'
import { MemoryStorageDriver } from './memory-storage-driver.ts'

describe('memory-storage-driver', () => {
  StorageDriverContract.run(() => new MemoryStorageDriver())

  test('should describe a binary, streaming driver that lives as long as the page', async () => {
    const { capabilities, name } = new MemoryStorageDriver()

    expect(name).toBe('memory')
    expect(capabilities).toEqual({
      driver: 'memory',
      persistence: 'page',
      binary: true,
      streaming: true,
      crossTabEvents: false,
      consistentAcrossTabs: true,
    })
  })

  test('should not share entries between drivers', async () => {
    const first = new MemoryStorageDriver()
    await first.write('namespace', 'key', 'value')

    expect(await new MemoryStorageDriver().read('namespace', 'key')).toBeUndefined()
  })
})
