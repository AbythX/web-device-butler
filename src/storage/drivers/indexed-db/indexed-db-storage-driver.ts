import type { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { StorageErrorFactory } from '../../errors/storage-error-factory.ts'
import { StorageUnsupportedError } from '../../errors/storage-unsupported-error.ts'
import { StorageCapabilities } from '../../storage-capabilities.ts'
import { StorageDriver } from '../storage-driver.ts'

interface ObjectStores {
  readonly values: IDBObjectStore
  readonly sizes: IDBObjectStore
}

/**
 * What is kept next to a value. Entries of earlier versions only have the size, as a number.
 */
interface EntryRecord {
  readonly size: number
  /** the beginning of the value */
  readonly head: string | Uint8Array
}

/**
 * IndexedDB: values of any size that persist and are shared by every tab of the origin.
 *
 * The library uses one database. A new object store needs a version change that every open tab has to take part in,
 * so all namespaces share two object stores under the key `[namespace, key]`: one holds the values, the other their
 * sizes and their first characters or bytes, which makes measuring a namespace and looking at the head of a large
 * entry cheap.
 */
export class IndexedDbStorageDriver extends StorageDriver {
  private static readonly version = 1
  private static readonly valueStore = 'values'
  private static readonly sizeStore = 'sizes'
  /** how much of the beginning of a value is kept next to its size, in characters or bytes */
  private static readonly headLength = 128

  /** the name a store is opened with: `{ driver: 'indexeddb' }` */
  public readonly name: string = 'indexeddb'
  /** kept with the origin, holds bytes as they are, cannot stream */
  public readonly capabilities = StorageCapabilities.indexedDb

  private connection: Promise<IDBDatabase> | undefined

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly databaseName = 'web-device-butler'
  ) {
    super()
  }

  /**
   * Opens the database, because IndexedDB can exist and still refuse to work (private mode in some browsers).
   */
  public async isSupported(): Promise<boolean> {
    try {
      if (this.environment.indexedDB === undefined || this.environment.keyRange === undefined) {
        return false
      }

      await this.open()

      return true
    } catch {
      return false
    }
  }

  /**
   * Reads the entry in a transaction of its own.
   */
  public read(namespace: string, key: string): Promise<string | Uint8Array | undefined> {
    return this.run<string | Uint8Array | undefined>('readonly', `Could not read '${key}'`, ({ values }) =>
      values.get([namespace, key])
    )
  }

  /**
   * Replaces the entry in one transaction, together with its size and the beginning that {@link peek} reads.
   */
  public async write(namespace: string, key: string, value: string | Uint8Array): Promise<void> {
    // a view is stored together with the whole buffer behind it
    const stored = typeof value === 'string' || value.byteLength === value.buffer.byteLength ? value : value.slice()
    const size = key.length * 2 + (typeof stored === 'string' ? stored.length * 2 : stored.byteLength)

    const record: EntryRecord = { size, head: stored.slice(0, IndexedDbStorageDriver.headLength) }

    await this.run('readwrite', `Could not write '${key}'`, ({ values, sizes }) => {
      sizes.put(record, [namespace, key])

      return values.put(stored, [namespace, key])
    })
  }

  /**
   * Answers from what is kept next to the size, without loading the value.
   */
  public override async peek(namespace: string, key: string, length: number): Promise<string | Uint8Array | undefined> {
    const record = await this.run<unknown>('readonly', `Could not read '${key}'`, ({ sizes }) =>
      sizes.get([namespace, key])
    )

    if (record === undefined) {
      return undefined
    }

    const head = IndexedDbStorageDriver.isRecord(record) ? record.head : undefined
    const isWholeValue = head !== undefined && head.length < IndexedDbStorageDriver.headLength

    if (head === undefined || (length > head.length && !isWholeValue)) {
      return super.peek(namespace, key, length)
    }

    return typeof head === 'string' ? head.slice(0, length) : head.subarray(0, length)
  }

  /**
   * Removes the entry together with its size.
   */
  public async remove(namespace: string, key: string): Promise<boolean> {
    const existing = await this.run('readwrite', `Could not remove '${key}'`, ({ values, sizes }) => {
      const lookup = sizes.getKey([namespace, key])
      values.delete([namespace, key])
      sizes.delete([namespace, key])

      return lookup
    })

    return existing !== undefined
  }

  /**
   * The keys of the namespace, read from the recorded sizes without loading a value.
   */
  public async *list(namespace: string): AsyncIterable<string> {
    const keys = await this.run('readonly', `Could not list '${namespace}'`, ({ sizes }) =>
      sizes.getAllKeys(this.rangeOf(namespace))
    )

    // SAFETY: every key of the size store is written by this driver as [namespace, key]
    yield* keys.map((key) => (key as [string, string])[1])
  }

  /**
   * Sums up the sizes that were recorded when the entries were written.
   */
  public async measure(namespace: string): Promise<number> {
    const recorded = await this.run<unknown[]>('readonly', `Could not measure '${namespace}'`, ({ sizes }) =>
      sizes.getAll(this.rangeOf(namespace))
    )

    return recorded.reduce<number>(
      (bytes, record) =>
        bytes + (IndexedDbStorageDriver.isRecord(record) ? record.size : typeof record === 'number' ? record : 0),
      0
    )
  }

  /**
   * Closes the connection. It is opened again by the next operation.
   */
  public override async close(): Promise<void> {
    const connection = this.connection
    this.connection = undefined
    await connection?.then(
      (database) => database.close(),
      () => undefined
    )
  }

  private static isRecord(record: unknown): record is EntryRecord {
    return (
      typeof record === 'object' &&
      record !== null &&
      'size' in record &&
      typeof record.size === 'number' &&
      'head' in record &&
      (typeof record.head === 'string' || record.head instanceof Uint8Array)
    )
  }

  /**
   * Every key of the namespace: an array sorts behind every string, and a shorter array before a longer one.
   */
  private rangeOf(namespace: string): IDBKeyRange {
    const keyRange = this.environment.keyRange

    if (keyRange === undefined) {
      throw new StorageUnsupportedError(`The storage driver '${this.name}' is not available`)
    }

    return keyRange.bound([namespace], [namespace, []])
  }

  private async run<Result>(
    mode: IDBTransactionMode,
    action: string,
    operation: (stores: ObjectStores) => IDBRequest<Result>
  ): Promise<Result> {
    try {
      try {
        return await this.transact(mode, operation)
      } catch (error) {
        // the connection was closed for a version change between opening it and using it
        if (StorageErrorFactory.isClosedConnection(error)) {
          this.connection = undefined

          return await this.transact(mode, operation)
        }

        throw error
      }
    } catch (error) {
      throw StorageErrorFactory.from(error, action)
    }
  }

  private async transact<Result>(
    mode: IDBTransactionMode,
    operation: (stores: ObjectStores) => IDBRequest<Result>
  ): Promise<Result> {
    const database = await this.open()

    return new Promise<Result>((resolve, reject) => {
      const transaction = database.transaction(
        [IndexedDbStorageDriver.valueStore, IndexedDbStorageDriver.sizeStore],
        mode
      )

      let request: IDBRequest<Result>

      try {
        request = operation({
          values: transaction.objectStore(IndexedDbStorageDriver.valueStore),
          sizes: transaction.objectStore(IndexedDbStorageDriver.sizeStore),
        })
      } catch (error) {
        // nothing of a half issued operation may be committed
        transaction.abort()
        reject(error)

        return
      }

      // only a completed transaction is durable, a successful request is not enough
      transaction.addEventListener('complete', () => resolve(request.result))
      transaction.addEventListener('abort', () => reject(transaction.error ?? request.error))
    })
  }

  private open(): Promise<IDBDatabase> {
    this.connection ??= this.connect().catch((error: unknown) => {
      this.connection = undefined
      throw error
    })

    return this.connection
  }

  private connect(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const factory = this.environment.indexedDB

      if (factory === undefined) {
        reject(new StorageUnsupportedError(`The storage driver '${this.name}' is not available`))

        return
      }

      const request = factory.open(this.databaseName, IndexedDbStorageDriver.version)

      request.addEventListener('upgradeneeded', () => {
        for (const name of [IndexedDbStorageDriver.valueStore, IndexedDbStorageDriver.sizeStore]) {
          if (!request.result.objectStoreNames.contains(name)) {
            request.result.createObjectStore(name)
          }
        }
      })
      request.addEventListener('error', () => reject(request.error))
      request.addEventListener('success', () => {
        const database = request.result

        const forget = () => {
          this.connection = undefined
        }

        // another tab wants to upgrade or delete the database, and an open connection would block it
        database.addEventListener('versionchange', () => {
          database.close()
          forget()
        })
        database.addEventListener('close', forget)

        resolve(database)
      })
    })
  }
}
