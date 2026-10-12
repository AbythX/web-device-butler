import { StorageUnsupportedError } from '../errors/storage-unsupported-error.ts'
import type { StorageCapabilities } from '../storage-capabilities.ts'

/**
 * One backend. A driver only knows how to read, write, remove and list raw values; namespacing, codecs, expiry,
 * locking and change events are handled once, by the store that uses it.
 *
 * A custom backend extends this class and is registered with `butler.storage.register()`.
 */
export abstract class StorageDriver {
  /** the name a store is opened with: `{ driver: 'local' }` */
  public abstract readonly name: string
  /** what the backend can do */
  public abstract readonly capabilities: StorageCapabilities

  /**
   * Whether the backend can be used right now. Must not throw.
   */
  public abstract isSupported(): Promise<boolean>

  /**
   * @returns what was written, or `undefined` if there is no such entry. A backend that only holds bytes returns a
   *   written string as its UTF-8 bytes.
   */
  public abstract read(namespace: string, key: string): Promise<string | Uint8Array | undefined>

  /**
   * Replaces the entry in one step: a reader sees the old value or the new one, never a part of it. A driver whose
   * capabilities are not `binary` only receives strings.
   */
  public abstract write(namespace: string, key: string, value: string | Uint8Array): Promise<void>

  /**
   * @returns whether there was an entry
   */
  public abstract remove(namespace: string, key: string): Promise<boolean>

  /**
   * The keys of the namespace, in no particular order.
   */
  public abstract list(namespace: string): AsyncIterable<string>

  /**
   * The bytes the namespace occupies.
   */
  public abstract measure(namespace: string): Promise<number>

  /**
   * The beginning of an entry, at most `length` characters or bytes. The store reads the head of an entry with it
   * without loading a large value. Drivers that can read a part of an entry override it.
   */
  public async peek(namespace: string, key: string, length: number): Promise<string | Uint8Array | undefined> {
    const value = await this.read(namespace, key)

    return typeof value === 'string' ? value.slice(0, length) : value?.subarray(0, length)
  }

  /**
   * Releases what the driver keeps open, such as a connection. Called when the storage manager is disposed; the
   * next operation opens it again. Overridden by drivers that keep something open.
   */
  public close(): Promise<void> {
    return Promise.resolve()
  }

  /**
   * Overridden by drivers that can stream.
   */
  public openReadStream(_namespace: string, _key: string): Promise<ReadableStream<Uint8Array> | undefined> {
    return Promise.reject(new StorageUnsupportedError(`The storage driver '${this.name}' cannot stream`))
  }

  /**
   * Overridden by drivers that can stream. The entry is replaced when the stream is closed and stays as it was if
   * the stream is aborted.
   */
  public openWriteStream(_namespace: string, _key: string): Promise<WritableStream<Uint8Array>> {
    return Promise.reject(new StorageUnsupportedError(`The storage driver '${this.name}' cannot stream`))
  }
}
