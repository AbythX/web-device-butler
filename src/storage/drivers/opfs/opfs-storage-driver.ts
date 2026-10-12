import type { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { StorageErrorFactory } from '../../errors/storage-error-factory.ts'
import { StorageUnsupportedError } from '../../errors/storage-unsupported-error.ts'
import { StorageCapabilities } from '../../storage-capabilities.ts'
import { StorageDriver } from '../storage-driver.ts'
import { OpfsName } from './opfs-name.ts'

/**
 * The origin private file system: large values and streams that persist and are shared by every tab of the origin.
 * Every namespace is a directory, every entry a file in it.
 *
 * A file is written through a writable that replaces it when it is closed, so a reader never sees a part of a
 * value. A new file exists, empty, before its first value is written. To tell that apart from an empty value, every
 * value starts with one marker byte, and an empty file counts as missing.
 *
 * Browsers without `createWritable()` on the main thread are reported as not supported.
 */
export class OpfsStorageDriver extends StorageDriver {
  private static readonly probeName = 'probe'
  private static readonly marker = new Uint8Array([1])

  /** the name a store is opened with: `{ driver: 'opfs' }` */
  public readonly name: string = 'opfs'
  /** kept with the origin, holds bytes as they are, can stream */
  public readonly capabilities = new StorageCapabilities({
    driver: this.name,
    persistence: 'origin',
    binary: true,
    streaming: true,
  })

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly rootName = 'web-device-butler'
  ) {
    super()
  }

  /**
   * Creates and removes a file, because the file system can exist and still refuse to work (private mode in some
   * browsers).
   */
  public async isSupported(): Promise<boolean> {
    try {
      // the name cannot collide with a namespace, their directories start with an underscore
      const root = await this.root()
      const probe = await root.getFileHandle(OpfsStorageDriver.probeName, { create: true })
      const canWrite = typeof probe.createWritable === 'function'

      await root.removeEntry(OpfsStorageDriver.probeName).catch(() => undefined)

      return canWrite
    } catch {
      return false
    }
  }

  /**
   * The bytes of the file of the entry. A string that was written comes back as its UTF-8 bytes.
   */
  public async read(namespace: string, key: string): Promise<Uint8Array | undefined> {
    return this.attempt(`Could not read '${key}'`, async () => {
      const file = await this.fileOf(namespace, key)

      return file === undefined ? undefined : new Uint8Array(await file.slice(1).arrayBuffer())
    })
  }

  public override async peek(namespace: string, key: string, length: number): Promise<Uint8Array | undefined> {
    return this.attempt(`Could not read '${key}'`, async () => {
      const file = await this.fileOf(namespace, key)

      return file === undefined ? undefined : new Uint8Array(await file.slice(1, 1 + length).arrayBuffer())
    })
  }

  /**
   * Writes the value through a stream; the file is replaced when the stream is closed.
   */
  public async write(namespace: string, key: string, value: string | Uint8Array): Promise<void> {
    const stream = await this.openWriteStream(namespace, key)
    const writer = stream.getWriter()

    try {
      await writer.write(typeof value === 'string' ? new TextEncoder().encode(value) : value)
      await writer.close()
    } catch (error) {
      await writer.abort(error).catch(() => undefined)
      throw StorageErrorFactory.from(error, `Could not write '${key}'`)
    }
  }

  /**
   * Deletes the file of the entry.
   */
  public async remove(namespace: string, key: string): Promise<boolean> {
    return this.attempt(`Could not remove '${key}'`, async () => {
      const directory = await this.directoryOf(namespace, false)

      if (directory === undefined || (await this.fileOf(namespace, key)) === undefined) {
        return false
      }

      await directory.removeEntry(OpfsName.encode(key))

      return true
    })
  }

  /**
   * The keys of the namespace, decoded from the names of its files.
   */
  public async *list(namespace: string): AsyncIterable<string> {
    yield* await this.attempt(`Could not list '${namespace}'`, async () => {
      const keys: string[] = []

      for await (const handle of (await this.directoryOf(namespace, false))?.values() ?? []) {
        const key = OpfsName.decode(handle.name)

        if (key !== undefined && handle.kind === 'file' && (await handle.getFile()).size > 0) {
          keys.push(key)
        }
      }

      return keys
    })
  }

  /**
   * Sums up the sizes of the files of the namespace.
   */
  public async measure(namespace: string): Promise<number> {
    return this.attempt(`Could not measure '${namespace}'`, async () => {
      let bytes = 0

      for await (const handle of (await this.directoryOf(namespace, false))?.values() ?? []) {
        if (handle.kind === 'file') {
          bytes += (await handle.getFile()).size
        }
      }

      return bytes
    })
  }

  public override async openReadStream(
    namespace: string,
    key: string
  ): Promise<ReadableStream<Uint8Array> | undefined> {
    return this.attempt(`Could not read '${key}'`, async () => (await this.fileOf(namespace, key))?.slice(1).stream())
  }

  public override async openWriteStream(namespace: string, key: string): Promise<WritableStream<Uint8Array>> {
    return this.attempt(`Could not write '${key}'`, async () => {
      const directory = await this.directoryOf(namespace, true)
      const name = OpfsName.encode(key)
      const handle = await directory.getFileHandle(name, { create: true })
      const writable = await handle.createWritable()

      const discard = async (reason: unknown) => {
        await writable.abort(reason).catch(() => undefined)

        // the file of a new entry was created for this stream and never got a value
        if ((await handle.getFile()).size === 0) {
          await directory.removeEntry(name).catch(() => undefined)
        }
      }

      try {
        await writable.write(OpfsStorageDriver.marker)
      } catch (error) {
        await discard(error)
        throw error
      }

      return new WritableStream<Uint8Array>({
        write: async (chunk) => {
          try {
            // SAFETY: the file system copies the bytes while writing; the DOM type only rules out shared memory, which
            // is written the same
            await writable.write(chunk as Uint8Array<ArrayBuffer>)
          } catch (error) {
            await discard(error)
            throw error
          }
        },
        close: () => writable.close(),
        abort: (reason) => discard(reason),
      })
    })
  }

  /**
   * @returns `undefined` if there is no such entry, which includes a file that never got a value
   */
  private async fileOf(namespace: string, key: string): Promise<File | undefined> {
    try {
      const directory = await this.directoryOf(namespace, false)
      const file = await (await directory?.getFileHandle(OpfsName.encode(key)))?.getFile()

      return file === undefined || file.size === 0 ? undefined : file
    } catch (error) {
      if (StorageErrorFactory.isNotFound(error)) {
        return undefined
      }

      throw error
    }
  }

  private directoryOf(namespace: string, create: true): Promise<FileSystemDirectoryHandle>
  private directoryOf(namespace: string, create: false): Promise<FileSystemDirectoryHandle | undefined>
  private async directoryOf(namespace: string, create: boolean): Promise<FileSystemDirectoryHandle | undefined> {
    try {
      return await (await this.root()).getDirectoryHandle(OpfsName.encode(namespace), { create })
    } catch (error) {
      if (!create && StorageErrorFactory.isNotFound(error)) {
        return undefined
      }

      throw error
    }
  }

  private async root(): Promise<FileSystemDirectoryHandle> {
    const storage = this.environment.originStorage

    if (typeof storage?.getDirectory !== 'function') {
      throw new StorageUnsupportedError(`The storage driver '${this.name}' is not available`)
    }

    return (await storage.getDirectory()).getDirectoryHandle(this.rootName, { create: true })
  }

  private async attempt<Result>(action: string, operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation()
    } catch (error) {
      throw StorageErrorFactory.from(error, action)
    }
  }
}
