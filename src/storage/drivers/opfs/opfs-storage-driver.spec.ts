import { beforeEach, describe, expect, test, vi } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { StorageAccessDeniedError } from '../../errors/storage-access-denied-error.ts'
import { StorageQuotaExceededError } from '../../errors/storage-quota-exceeded-error.ts'
import { StorageUnsupportedError } from '../../errors/storage-unsupported-error.ts'
import { FakeFileSystemDirectory, FakeFileSystemFile, FakeFileSystemWritable } from '../../testing/fake-file-system.ts'
import { StorageDriverContract } from '../../testing/storage-driver-contract.ts'
import { OpfsName } from './opfs-name.ts'
import { OpfsStorageDriver } from './opfs-storage-driver.ts'

const environmentOf = (getDirectory: unknown) =>
  BrowserEnvironment.of({ navigator: { storage: { getDirectory } } as unknown as Navigator })

const decoder = new TextDecoder()

describe('opfs-storage-driver', () => {
  let fileSystem!: FakeFileSystemDirectory
  let sut!: OpfsStorageDriver

  const namespaceDirectory = async (namespace = 'namespace') =>
    (await fileSystem.getDirectoryHandle('web-device-butler')).getDirectoryHandle(OpfsName.encode(namespace))

  beforeEach(() => {
    fileSystem = new FakeFileSystemDirectory()
    sut = new OpfsStorageDriver(environmentOf(async () => fileSystem))
  })

  StorageDriverContract.run(() => {
    const emptyFileSystem = new FakeFileSystemDirectory()

    return new OpfsStorageDriver(environmentOf(async () => emptyFileSystem))
  })

  test('should describe a binary, streaming driver that is shared by the origin', async () => {
    expect(sut.name).toBe('opfs')
    expect(sut.capabilities).toEqual({
      driver: 'opfs',
      persistence: 'origin',
      binary: true,
      streaming: true,
      crossTabEvents: true,
      consistentAcrossTabs: true,
    })
  })

  test('should keep every namespace in its own directory below one directory of the library', async () => {
    await sut.write('my app/settings', 'Theme', 'dark')

    const names: string[] = []

    for await (const name of fileSystem.keys()) {
      names.push(name)
    }

    const directory = await namespaceDirectory('my app/settings')
    const file = await (await directory.getFileHandle('_%54heme')).getFile()

    expect(names).toEqual(['web-device-butler'])
    expect(directory.name).toBe('_my%20app%2fsettings')
    expect(decoder.decode(await file.arrayBuffer())).toBe('\u0001dark')
  })

  test('should use the directory it was constructed with', async () => {
    await new OpfsStorageDriver(
      environmentOf(async () => fileSystem),
      'custom-root'
    ).write('namespace', 'key', 'value')

    expect((await fileSystem.getDirectoryHandle('custom-root')).kind).toBe('directory')
  })

  test('should share the entries with a second driver on the same file system', async () => {
    await sut.write('namespace', 'key', 'value')

    const second = new OpfsStorageDriver(environmentOf(async () => fileSystem))

    expect(decoder.decode(await second.read('namespace', 'key'))).toBe('value')
  })

  describe('a file without a value', () => {
    beforeEach(async () => {
      await sut.write('namespace', 'other', 'value')
      // what another tab leaves for a moment when it starts to write a new entry
      await (await namespaceDirectory()).getFileHandle(OpfsName.encode('key'), { create: true })
    })

    test('should count as missing', async () => {
      expect(await sut.read('namespace', 'key')).toBeUndefined()
      expect(await sut.peek('namespace', 'key', 10)).toBeUndefined()
      expect(await sut.openReadStream('namespace', 'key')).toBeUndefined()
      expect(await sut.remove('namespace', 'key')).toBe(false)
    })

    test('should not be listed', async () => {
      const keys: string[] = []

      for await (const key of sut.list('namespace')) {
        keys.push(key)
      }

      expect(keys).toEqual(['other'])
    })
  })

  test('should ignore files of the browser when listing', async () => {
    await sut.write('namespace', 'key', 'value')
    const directory = await namespaceDirectory()
    directory.add(new FakeFileSystemFile('_key.crswap'))
    await directory.getDirectoryHandle('_nested', { create: true })

    const keys: string[] = []

    for await (const key of sut.list('namespace')) {
      keys.push(key)
    }

    expect(keys).toEqual(['key'])
  })

  test('should keep the old value and remove nothing if a write fails', async () => {
    await sut.write('namespace', 'key', 'old')
    const error = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    const write = vi.spyOn(FakeFileSystemWritable.prototype, 'write')
    write.mockResolvedValueOnce().mockRejectedValueOnce(error)

    const failed = sut.write('namespace', 'key', 'new')

    await expect(failed).rejects.toThrowError(StorageQuotaExceededError)
    await expect(failed).rejects.toThrowError(expect.objectContaining({ cause: error }))
    expect(decoder.decode(await sut.read('namespace', 'key'))).toBe('old')
    write.mockRestore()
  })

  test('should leave no file behind if the write of a new entry fails', async () => {
    const write = vi.spyOn(FakeFileSystemWritable.prototype, 'write')
    write.mockResolvedValueOnce().mockRejectedValueOnce(new Error('disk on fire'))

    await expect(sut.write('namespace', 'key', 'new')).rejects.toThrowError("Could not write 'key'")

    const names: string[] = []

    for await (const name of (await namespaceDirectory()).keys()) {
      names.push(name)
    }

    expect(names).toEqual([])
    write.mockRestore()
  })

  describe('#isSupported', () => {
    test('should leave nothing behind', async () => {
      await sut.isSupported()

      const names: string[] = []

      for await (const name of (await fileSystem.getDirectoryHandle('web-device-butler')).keys()) {
        names.push(name)
      }

      expect(names).toEqual([])
    })

    test.each([
      ['there is no navigator', BrowserEnvironment.of({})],
      ['the browser has no storage manager', BrowserEnvironment.of({ navigator: {} as Navigator })],
      ['the browser has no file system', environmentOf(undefined)],
      ['the file system refuses access', environmentOf(() => Promise.reject(new DOMException('no', 'SecurityError')))],
    ])('should not be supported if %s', async (_, environment) => {
      expect(await new OpfsStorageDriver(environment).isSupported()).toBe(false)
    })

    test('should not be supported if files cannot be written from the page', async () => {
      const createWritable = FakeFileSystemFile.prototype.createWritable
      Reflect.deleteProperty(FakeFileSystemFile.prototype, 'createWritable')

      try {
        expect(await sut.isSupported()).toBe(false)
      } finally {
        FakeFileSystemFile.prototype.createWritable = createWritable
      }
    })
  })

  describe('errors', () => {
    test('should report a missing file system on every operation', async () => {
      const unsupported = new OpfsStorageDriver(BrowserEnvironment.of({}))

      await expect(unsupported.read('namespace', 'key')).rejects.toThrowError(StorageUnsupportedError)
      await expect(unsupported.write('namespace', 'key', 'value')).rejects.toThrowError(StorageUnsupportedError)
      await expect(unsupported.remove('namespace', 'key')).rejects.toThrowError(StorageUnsupportedError)
      await expect(unsupported.measure('namespace')).rejects.toThrowError(StorageUnsupportedError)
      await expect(unsupported.openReadStream('namespace', 'key')).rejects.toThrowError(StorageUnsupportedError)
    })

    test('should report denied access', async () => {
      const denied = new OpfsStorageDriver(
        environmentOf(() => Promise.reject(new DOMException('The operation is insecure.', 'SecurityError')))
      )

      await expect(denied.read('namespace', 'key')).rejects.toThrowError(StorageAccessDeniedError)
    })
  })
})
