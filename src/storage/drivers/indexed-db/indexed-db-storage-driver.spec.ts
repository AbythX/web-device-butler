import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { StorageError } from '../../errors/storage-error.ts'
import { StorageQuotaExceededError } from '../../errors/storage-quota-exceeded-error.ts'
import { StorageUnsupportedError } from '../../errors/storage-unsupported-error.ts'
import { StorageDriverContract } from '../../testing/storage-driver-contract.ts'
import { IndexedDbStorageDriver } from './indexed-db-storage-driver.ts'

const requestOf = <Result>(request: IDBRequest<Result>) =>
  new Promise<Result>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })

describe('indexed-db-storage-driver', () => {
  let indexedDB!: IDBFactory
  let drivers!: IndexedDbStorageDriver[]

  /** a driver as a tab of the browser would create it */
  const createForTab = (databaseName?: string) => {
    const driver = new IndexedDbStorageDriver(BrowserEnvironment.of({ indexedDB, IDBKeyRange }), databaseName)
    drivers.push(driver)

    return driver
  }

  beforeEach(() => {
    indexedDB = new IDBFactory()
    drivers = []
  })

  afterEach(async () => {
    await Promise.all(drivers.map((driver) => driver.close()))
  })

  StorageDriverContract.run(
    () => new IndexedDbStorageDriver(BrowserEnvironment.of({ indexedDB: new IDBFactory(), IDBKeyRange }))
  )

  test('should describe a binary driver that is shared by the origin and cannot stream', async () => {
    const sut = createForTab()

    expect(sut.name).toBe('indexeddb')
    expect(sut.capabilities).toEqual({
      driver: 'indexeddb',
      persistence: 'origin',
      binary: true,
      streaming: false,
      crossTabEvents: true,
      consistentAcrossTabs: true,
    })
  })

  test('should not open the database before it is used', async () => {
    createForTab()

    expect(await indexedDB.databases()).toEqual([])
  })

  test('should keep everything in one database', async () => {
    const sut = createForTab()

    await sut.write('first', 'key', 'value')
    await sut.write('second', 'key', 'value')

    expect(await indexedDB.databases()).toEqual([{ name: 'web-device-butler', version: 1 }])
  })

  test('should use the database it was constructed with', async () => {
    await createForTab('custom-database').write('namespace', 'key', 'value')

    expect(await indexedDB.databases()).toEqual([{ name: 'custom-database', version: 1 }])
  })

  test('should share the entries with the driver of another tab', async () => {
    await createForTab().write('namespace', 'key', 'value')

    expect(await createForTab().read('namespace', 'key')).toBe('value')
  })

  test('should return a string as a string and bytes as bytes', async () => {
    const sut = createForTab()

    await sut.write('namespace', 'text', 'value')
    await sut.write('namespace', 'bytes', new Uint8Array([1, 2, 3]))

    expect(await sut.read('namespace', 'text')).toBe('value')
    expect(await sut.read('namespace', 'bytes')).toEqual(new Uint8Array([1, 2, 3]))
  })

  test('should only store the bytes of a view, not the buffer behind it', async () => {
    const sut = createForTab()
    const view = new Uint8Array(1000).subarray(10, 13)

    await sut.write('namespace', 'key', view)

    const stored = (await sut.read('namespace', 'key')) as Uint8Array
    expect(stored.buffer.byteLength).toBe(3)
    expect(await sut.measure('namespace')).toBe('key'.length * 2 + 3)
  })

  test('should measure from the recorded sizes', async () => {
    const sut = createForTab()

    await sut.write('namespace', 'text', 'value')
    await sut.write('namespace', 'bytes', new Uint8Array(100))

    expect(await sut.measure('namespace')).toBe(('text'.length + 'value'.length) * 2 + 'bytes'.length * 2 + 100)
  })

  test('should peek at a large entry without loading it', async () => {
    const sut = createForTab()
    await sut.write('namespace', 'text', 'x'.repeat(10_000))
    await sut.write('namespace', 'bytes', new Uint8Array(10_000).fill(7))
    const read = vi.spyOn(sut, 'read')

    expect(await sut.peek('namespace', 'text', 96)).toBe('x'.repeat(96))
    expect(await sut.peek('namespace', 'bytes', 96)).toEqual(new Uint8Array(96).fill(7))
    expect(read).not.toHaveBeenCalled()
  })

  test('should load the entry for a peek that reaches further than what is kept next to it', async () => {
    const sut = createForTab()
    await sut.write('namespace', 'text', 'x'.repeat(10_000))

    expect(await sut.peek('namespace', 'text', 500)).toBe('x'.repeat(500))
  })

  test('should still peek at and measure an entry of a version that only recorded its size', async () => {
    const sut = createForTab()
    await sut.write('namespace', 'new', 'value')
    const database = await requestOf(indexedDB.open('web-device-butler', 1))
    const transaction = database.transaction(['values', 'sizes'], 'readwrite')
    transaction.objectStore('values').put('old value', ['namespace', 'old'])
    await requestOf(transaction.objectStore('sizes').put(24, ['namespace', 'old']))
    database.close()

    expect(await sut.peek('namespace', 'old', 3)).toBe('old')
    expect(await sut.measure('namespace')).toBe(('new'.length + 'value'.length) * 2 + 24)
  })

  describe('a version change by another tab', () => {
    const upgrade = async () => {
      const request = indexedDB.open('web-device-butler', 2)
      const blocked = vi.fn()
      request.addEventListener('blocked', blocked)
      const database = await requestOf(request)

      return { database, blocked }
    }

    test('should not block the upgrade', async () => {
      const sut = createForTab()
      await sut.write('namespace', 'key', 'value')

      const { database, blocked } = await upgrade()

      expect(blocked).not.toHaveBeenCalled()
      expect(database.version).toBe(2)
      database.close()
    })

    test('should fail with a storage error while the database is newer than this version knows', async () => {
      const sut = createForTab()
      await sut.write('namespace', 'key', 'value')
      const { database } = await upgrade()

      await expect(sut.read('namespace', 'key')).rejects.toThrowError(StorageError)
      await expect(sut.read('namespace', 'key')).rejects.toThrowError(
        expect.objectContaining({ cause: expect.objectContaining({ name: 'VersionError' }) })
      )
      database.close()
    })

    test('should reopen the connection after it was closed for a deletion', async () => {
      const sut = createForTab()
      await sut.write('namespace', 'key', 'value')

      await requestOf(indexedDB.deleteDatabase('web-device-butler'))

      expect(await sut.read('namespace', 'key')).toBeUndefined()
      await sut.write('namespace', 'key', 'again')
      expect(await sut.read('namespace', 'key')).toBe('again')
    })
  })

  describe('#isSupported', () => {
    test.each([
      ['there is no IndexedDB', BrowserEnvironment.of({ IDBKeyRange })],
      ['there are no key ranges', BrowserEnvironment.of({ indexedDB: new IDBFactory() })],
    ])('should not be supported if %s', async (_, environment) => {
      expect(await new IndexedDbStorageDriver(environment).isSupported()).toBe(false)
    })

    test('should not be supported if the database cannot be opened', async () => {
      vi.spyOn(indexedDB, 'open').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      })

      expect(await createForTab().isSupported()).toBe(false)
    })

    test('should try to open the database again after a failure', async () => {
      const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      })

      const sut = createForTab()

      expect(await sut.isSupported()).toBe(false)
      expect(await sut.isSupported()).toBe(true)
      expect(open).toHaveBeenCalledTimes(2)
    })
  })

  describe('errors', () => {
    test('should report a missing IndexedDB on every operation', async () => {
      const sut = new IndexedDbStorageDriver(BrowserEnvironment.of({}))

      await expect(sut.read('namespace', 'key')).rejects.toThrowError(StorageUnsupportedError)
      await expect(sut.write('namespace', 'key', 'value')).rejects.toThrowError(StorageUnsupportedError)
      await expect(sut.remove('namespace', 'key')).rejects.toThrowError(StorageUnsupportedError)
      await expect(sut.measure('namespace')).rejects.toThrowError(StorageUnsupportedError)
    })

    test('should report a full storage and keep the old value', async () => {
      const sut = createForTab()
      await sut.write('namespace', 'key', 'old')
      const error = new DOMException('The quota has been exceeded.', 'QuotaExceededError')

      const put = vi.spyOn(Object.getPrototypeOf(await openValues()), 'put').mockImplementationOnce(() => {
        throw error
      })

      const failed = sut.write('namespace', 'key', 'new')

      await expect(failed).rejects.toThrowError(StorageQuotaExceededError)
      await expect(failed).rejects.toThrowError(expect.objectContaining({ cause: error }))
      expect(await sut.read('namespace', 'key')).toBe('old')
      put.mockRestore()
    })

    const openValues = async () => {
      const database = await requestOf(indexedDB.open('web-device-butler'))
      const values = database.transaction('values').objectStore('values')
      database.close()

      return values
    }
  })
})
