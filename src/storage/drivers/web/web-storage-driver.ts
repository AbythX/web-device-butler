import { StorageErrorFactory } from '../../errors/storage-error-factory.ts'
import { StorageUnsupportedError } from '../../errors/storage-unsupported-error.ts'
import { StorageDriver } from '../storage-driver.ts'

/**
 * The shared implementation for `localStorage` and `sessionStorage`. All entries of a namespace share a key prefix.
 */
export abstract class WebStorageDriver extends StorageDriver {
  private static readonly probeKey = 'web-device-butler:probe'

  /**
   * The `Storage` object, or `undefined` where the browser has none or refuses access to it.
   */
  protected abstract get storage(): Storage | undefined

  /**
   * Writes once, because a `Storage` object can exist and still refuse every write (private mode, no quota).
   */
  public async isSupported(): Promise<boolean> {
    try {
      const storage = this.storage

      if (storage === undefined) {
        return false
      }

      storage.setItem(WebStorageDriver.probeKey, '1')
      storage.removeItem(WebStorageDriver.probeKey)

      return true
    } catch {
      return false
    }
  }

  /**
   * Reads the item whose key is the namespace prefix followed by the key.
   */
  public async read(namespace: string, key: string): Promise<string | undefined> {
    return this.attempt(
      `Could not read '${key}'`,
      (storage) => storage.getItem(this.prefixOf(namespace) + key) ?? undefined
    )
  }

  /**
   * Sets the item.
   *
   * @throws TypeError for bytes: Web Storage only holds strings, the store encodes bytes before they get here
   */
  public async write(namespace: string, key: string, value: string | Uint8Array): Promise<void> {
    if (typeof value !== 'string') {
      throw new TypeError(`The storage driver '${this.name}' only holds strings`)
    }

    this.attempt(`Could not write '${key}'`, (storage) => storage.setItem(this.prefixOf(namespace) + key, value))
  }

  /**
   * @returns whether there was an entry
   */
  public async remove(namespace: string, key: string): Promise<boolean> {
    return this.attempt(`Could not remove '${key}'`, (storage) => {
      const storageKey = this.prefixOf(namespace) + key
      const exists = storage.getItem(storageKey) !== null
      storage.removeItem(storageKey)

      return exists
    })
  }

  /**
   * The keys of the items that carry the prefix of the namespace.
   */
  public async *list(namespace: string): AsyncIterable<string> {
    const prefix = this.prefixOf(namespace)
    yield* this.attempt(`Could not list '${namespace}'`, (storage) =>
      this.storageKeysOf(storage, prefix).map((storageKey) => storageKey.slice(prefix.length))
    )
  }

  /**
   * Two bytes per character of the keys and values of the namespace.
   */
  public async measure(namespace: string): Promise<number> {
    const prefix = this.prefixOf(namespace)

    return this.attempt(`Could not measure '${namespace}'`, (storage) =>
      this.storageKeysOf(storage, prefix).reduce(
        // strings are held as UTF-16, two bytes per character
        (bytes, storageKey) => bytes + (storageKey.length + (storage.getItem(storageKey)?.length ?? 0)) * 2,
        0
      )
    )
  }

  private storageKeysOf(storage: Storage, prefix: string): string[] {
    const keys: string[] = []

    for (let index = 0; index < storage.length; index++) {
      const storageKey = storage.key(index)

      if (storageKey?.startsWith(prefix)) {
        keys.push(storageKey)
      }
    }

    return keys
  }

  /**
   * The namespace is encoded, so the first colon always ends it and no namespace is the prefix of another.
   */
  private prefixOf(namespace: string): string {
    return `${encodeURIComponent(namespace)}:`
  }

  private attempt<Result>(action: string, operation: (storage: Storage) => Result): Result {
    try {
      const storage = this.storage

      if (storage === undefined) {
        throw new StorageUnsupportedError(`The storage driver '${this.name}' is not available`)
      }

      return operation(storage)
    } catch (error) {
      throw StorageErrorFactory.from(error, action)
    }
  }
}
