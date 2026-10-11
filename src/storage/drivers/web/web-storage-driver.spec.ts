import { describe, expect, test, vi } from 'vitest'

import { DeviceEnvironment } from '../../../core/environment/device-environment.ts'
import { StorageAccessDeniedError } from '../../errors/storage-access-denied-error.ts'
import { StorageQuotaExceededError } from '../../errors/storage-quota-exceeded-error.ts'
import { StorageUnsupportedError } from '../../errors/storage-unsupported-error.ts'
import { FakeStorage } from '../../testing/fake-storage.ts'
import { LocalStorageDriver } from './local-storage-driver.ts'

describe('web-storage-driver', () => {
  const createDriver = (localStorage: Storage | undefined) =>
    new LocalStorageDriver(DeviceEnvironment.of({ localStorage }))

  test('should prefix the keys with the encoded namespace', async () => {
    const storage = new FakeStorage()

    await createDriver(storage).write('my app:settings', 'theme', 'dark')

    expect(storage.getItem('my%20app%3Asettings:theme')).toBe('dark')
  })

  test('should leave the entries of others in the storage alone', async () => {
    const storage = new FakeStorage()
    storage.setItem('foreign', 'value')
    storage.setItem('namespace', 'no colon')
    const sut = createDriver(storage)

    await sut.write('namespace', 'key', 'value')
    await sut.remove('namespace', 'key')

    expect(await sut.measure('namespace')).toBe(0)
    expect(storage.getItem('foreign')).toBe('value')
    expect(storage.getItem('namespace')).toBe('no colon')
  })

  test('should measure keys and values with two bytes per character', async () => {
    const storage = new FakeStorage()
    const sut = createDriver(storage)

    await sut.write('ns', 'key', 'value')

    expect(await sut.measure('ns')).toBe(('ns:key'.length + 'value'.length) * 2)
  })

  describe('#isSupported', () => {
    test('should not be supported without a storage', async () => {
      expect(await createDriver(undefined).isSupported()).toBe(false)
    })

    test('should not be supported if reading the storage of the browser throws', async () => {
      const environment = new DeviceEnvironment(() => ({
        get localStorage(): Storage {
          throw new DOMException('The operation is insecure.', 'SecurityError')
        },
      }))

      expect(await new LocalStorageDriver(environment).isSupported()).toBe(false)
    })

    test.each(['QuotaExceededError', 'SecurityError'])(
      'should not be supported if writing fails with %s',
      async (name) => {
        const storage = new FakeStorage()
        vi.spyOn(storage, 'setItem').mockImplementation(() => {
          throw new DOMException('refused', name)
        })

        expect(await createDriver(storage).isSupported()).toBe(false)
      }
    )

    test('should leave nothing behind', async () => {
      const storage = new FakeStorage()

      await createDriver(storage).isSupported()

      expect(storage.length).toBe(0)
    })
  })

  describe('errors', () => {
    test('should report a full storage', async () => {
      const sut = createDriver(new FakeStorage(50))

      const write = sut.write('namespace', 'key', 'x'.repeat(100))

      await expect(write).rejects.toThrowError(StorageQuotaExceededError)
      await expect(write).rejects.toThrowError(expect.objectContaining({ cause: expect.any(DOMException) }))
    })

    test('should report denied access', async () => {
      const storage = new FakeStorage()
      vi.spyOn(storage, 'getItem').mockImplementation(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      })

      await expect(createDriver(storage).read('namespace', 'key')).rejects.toThrowError(StorageAccessDeniedError)
    })

    test('should report a missing storage on every operation', async () => {
      const sut = createDriver(undefined)

      await expect(sut.read('namespace', 'key')).rejects.toThrowError(StorageUnsupportedError)
      await expect(sut.write('namespace', 'key', 'value')).rejects.toThrowError(StorageUnsupportedError)
      await expect(sut.remove('namespace', 'key')).rejects.toThrowError(StorageUnsupportedError)
      await expect(sut.measure('namespace')).rejects.toThrowError(StorageUnsupportedError)
    })
  })
})
