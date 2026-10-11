import type { CrossTabLock } from '../../core/coordination/lock/cross-tab-lock.ts'
import type { CrossTabLockHandle } from '../../core/coordination/lock/cross-tab-lock-handle.ts'
import type { LockMode } from '../../core/coordination/lock/lock-manager-like.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import type { Codec } from '../codecs/codec.ts'
import type { StorageDriver } from '../drivers/storage-driver.ts'
import { StorageCodecError } from '../errors/storage-codec-error.ts'
import type { StorageError } from '../errors/storage-error.ts'
import { StorageErrorFactory } from '../errors/storage-error-factory.ts'
import { StorageLockedError } from '../errors/storage-locked-error.ts'
import { StorageQuotaExceededError } from '../errors/storage-quota-exceeded-error.ts'
import { StorageUnsupportedError } from '../errors/storage-unsupported-error.ts'
import { StorageVersionError } from '../errors/storage-version-error.ts'
import type { StorageSpaceReader } from '../space/storage-space-reader.ts'
import type { StorageCapabilities } from '../storage-capabilities.ts'
import { DefaultLockedEntry } from './default-locked-entry.ts'
import type { LockedEntry } from './locked-entry.ts'
import { StorageEnvelope } from './storage-envelope.ts'
import { StoreChangeHub } from './store-change-hub.ts'
import type { Store, StoreEvents, StoreSetOptions, StoreWriteOptions } from './store.ts'

/**
 * The implementation of {@link Store}.
 */
export class DefaultStore<T = unknown> extends EventEmitter<StoreEvents> implements Store<T> {
  private static readonly lockPrefix = 'web-device-butler/store'
  private static readonly lineFeed = 10

  private changeSubscription: EventSubscription | undefined

  /**
   * @param namespace the name the store was opened with
   * @param scope the namespace as the driver sees it, including the prefix of the application
   */
  public constructor(
    public readonly namespace: string,
    private readonly scope: string,
    private readonly driver: StorageDriver,
    private readonly codec: Codec<T>,
    private readonly locks: CrossTabLock,
    private readonly changes: StoreChangeHub,
    private readonly spaceReader: StorageSpaceReader,
    private readonly logger: Logger
  ) {
    super()
  }

  public get capabilities(): StorageCapabilities {
    return this.driver.capabilities
  }

  public async get(key: string): Promise<T | undefined> {
    return this.read(key, false)
  }

  public async set(key: string, value: T, options: StoreSetOptions = {}): Promise<void> {
    const sealed = this.seal(key, value, options.ttl)
    await this.withKeyLock(key, 'exclusive', options, () => this.write(key, sealed))
  }

  public async has(key: string): Promise<boolean> {
    const head = await this.attempt(`Could not read '${key}'`, () =>
      this.driver.peek(this.scope, key, StorageEnvelope.maxHeaderLength)
    )

    if (head === undefined) {
      return false
    }

    if (StorageEnvelope.open(key, head).isExpired(Date.now())) {
      await this.purgeExpired(key)

      return false
    }

    return true
  }

  public delete(key: string, options: StoreWriteOptions = {}): Promise<boolean> {
    return this.withKeyLock(key, 'exclusive', options, () => this.remove(key))
  }

  public update(
    key: string,
    fn: (current: T | undefined) => T | Promise<T>,
    options: StoreSetOptions = {}
  ): Promise<T> {
    return this.lock(
      key,
      async (entry) => {
        const next = await fn(await entry.get())
        await entry.set(next, { ttl: options.ttl })

        return next
      },
      options
    )
  }

  public lock<Result>(
    key: string,
    task: (entry: LockedEntry<T>) => Result | Promise<Result>,
    options: StoreWriteOptions = {}
  ): Promise<Result> {
    return this.withKeyLock(key, 'exclusive', options, async () => {
      await this.settle()

      const entry = new DefaultLockedEntry<T>(key, {
        get: () => this.read(key, true),
        set: (value, ttl) => this.write(key, this.seal(key, value, ttl)),
        delete: () => this.remove(key),
      })

      try {
        return await task(entry)
      } finally {
        entry.release()
      }
    })
  }

  public size(): Promise<number> {
    return this.attempt(`Could not measure '${this.namespace}'`, () => this.driver.measure(this.scope))
  }

  public async clear(options: StoreWriteOptions = {}): Promise<void> {
    for (const key of await this.list()) {
      await this.delete(key, options)
    }
  }

  public async *keys(): AsyncIterable<string> {
    for (const key of await this.list()) {
      if (await this.readable(key, () => this.has(key))) {
        yield key
      }
    }
  }

  public async *entries(): AsyncIterable<[string, T]> {
    for (const key of await this.list()) {
      const value = await this.readable(key, () => this.get(key))

      if (value !== undefined) {
        yield [key, value]
      }
    }
  }

  public async readStream(
    key: string,
    options: StoreWriteOptions = {}
  ): Promise<ReadableStream<Uint8Array> | undefined> {
    this.requireStreaming()

    const handle = await this.acquire(key, 'shared', options)

    try {
      const source = await this.attempt(`Could not read '${key}'`, () => this.driver.openReadStream(this.scope, key))

      if (source === undefined) {
        await handle.release()

        return undefined
      }

      const reader = source.getReader()
      const { envelope, head } = await this.readHead(key, reader)

      if (envelope.isExpired(Date.now())) {
        await reader.cancel()
        await handle.release()
        await this.purgeExpired(key)

        return undefined
      }

      const rest = head.subarray(envelope.payloadOffset)

      return new ReadableStream<Uint8Array>({
        start: (controller) => {
          if (rest.byteLength > 0) {
            controller.enqueue(rest)
          }
        },
        pull: async (controller) => {
          try {
            const { done, value } = await reader.read()

            if (done) {
              await handle.release()
              controller.close()
            } else {
              controller.enqueue(value)
            }
          } catch (error) {
            await handle.release()
            throw await this.translate(error, `Could not read '${key}'`)
          }
        },
        cancel: async (reason) => {
          try {
            await reader.cancel(reason)
          } finally {
            await handle.release()
          }
        },
      })
    } catch (error) {
      handle.release()
      throw error
    }
  }

  public async writeStream(key: string, options: StoreSetOptions = {}): Promise<WritableStream<Uint8Array>> {
    this.requireStreaming()
    const header = StorageEnvelope.headerBytes(this.expiryOf(options.ttl))

    const handle = await this.acquire(key, 'exclusive', options)

    try {
      const action = `Could not write '${key}'`
      const target = await this.attempt(action, () => this.driver.openWriteStream(this.scope, key))
      const writer = target.getWriter()

      const fail = async (error: unknown) => {
        await writer.abort(error).catch(() => undefined)
        await handle.release()

        return this.translate(error, action)
      }

      try {
        await writer.write(header)
      } catch (error) {
        throw await fail(error)
      }

      return new WritableStream<Uint8Array>({
        write: async (chunk) => {
          try {
            await writer.write(chunk)
          } catch (error) {
            // a stream that failed is neither closed nor aborted by its owner any more
            throw await fail(error)
          }
        },
        close: async () => {
          try {
            await writer.close()
          } catch (error) {
            throw await fail(error)
          }

          await handle.release()
          this.changes.publish(this.driver, this.scope, 'set', key)
        },
        abort: async (reason) => {
          try {
            await writer.abort(reason)
          } finally {
            await handle.release()
          }
        },
      })
    } catch (error) {
      handle.release()
      throw error
    }
  }

  protected override onFirstListener(): void {
    this.changeSubscription = this.changes.subscribe(this.driver, this.scope, (change) => this.emit('change', change))
  }

  protected override onLastListenerRemoved(): void {
    this.changeSubscription?.unsubscribe()
    this.changeSubscription = undefined
  }

  /**
   * @param holdsLock whether the caller holds the lock of the entry
   */
  private async read(key: string, holdsLock: boolean): Promise<T | undefined> {
    const raw = await this.attempt(`Could not read '${key}'`, () => this.driver.read(this.scope, key))

    if (raw === undefined) {
      return undefined
    }

    const envelope = StorageEnvelope.open(key, raw)

    if (envelope.isExpired(Date.now())) {
      await (holdsLock ? this.remove(key) : this.purgeExpired(key))

      return undefined
    }

    try {
      return this.codec.decode(envelope.payload)
    } catch (error) {
      throw new StorageCodecError(`Could not decode the value of '${key}'`, { cause: error })
    }
  }

  private async write(key: string, sealed: string | Uint8Array): Promise<void> {
    await this.attempt(`Could not write '${key}'`, () => this.driver.write(this.scope, key, sealed))
    this.changes.publish(this.driver, this.scope, 'set', key)
  }

  /**
   * @returns whether there was an entry that had not expired
   */
  private async remove(key: string): Promise<boolean> {
    const action = `Could not remove '${key}'`
    const head = await this.attempt(action, () => this.driver.peek(this.scope, key, StorageEnvelope.maxHeaderLength))

    if (head === undefined) {
      return false
    }

    await this.attempt(action, () => this.driver.remove(this.scope, key))
    this.changes.publish(this.driver, this.scope, 'delete', key)

    return !this.isExpired(key, head)
  }

  /**
   * Expiry is enforced on read. The entry is only removed if no one is writing it right now, and only if it is still
   * expired then: a tab may just have set a new value.
   */
  private async purgeExpired(key: string): Promise<void> {
    try {
      const handle = await this.locks.tryAcquire(this.lockNameOf(key))

      if (handle === undefined) {
        return
      }

      try {
        await this.settle()
        const head = await this.driver.peek(this.scope, key, StorageEnvelope.maxHeaderLength)

        if (head !== undefined && this.isExpired(key, head)) {
          await this.driver.remove(this.scope, key)
          this.changes.publish(this.driver, this.scope, 'delete', key)
        }
      } finally {
        await handle.release()
      }
    } catch (error) {
      // the entry already counts as missing, removing it is housekeeping
      this.logger.debug(`Could not remove the expired entry '${key}'`, error)
    }
  }

  private isExpired(key: string, head: string | Uint8Array): boolean {
    try {
      return StorageEnvelope.open(key, head).isExpired(Date.now())
    } catch {
      return false
    }
  }

  private seal(key: string, value: T, ttl: number | undefined): string | Uint8Array {
    const expiresAt = this.expiryOf(ttl)

    let payload: string | Uint8Array

    try {
      payload = this.codec.encode(value)
    } catch (error) {
      throw new StorageCodecError(`Could not encode the value of '${key}'`, { cause: error })
    }

    return StorageEnvelope.seal(payload, expiresAt, this.driver.capabilities.binary)
  }

  private expiryOf(ttl: number | undefined): number | undefined {
    if (ttl === undefined) {
      return undefined
    }

    if (!Number.isFinite(ttl) || ttl <= 0) {
      throw new TypeError(`A ttl has to be a positive number of milliseconds, got ${ttl}`)
    }

    return Date.now() + ttl
  }

  /**
   * Reads from the stream until the header line is complete.
   */
  private async readHead(key: string, reader: ReadableStreamDefaultReader<Uint8Array>) {
    let head = new Uint8Array(0)

    while (!head.subarray(0, StorageEnvelope.maxHeaderLength).includes(DefaultStore.lineFeed)) {
      const { done, value } = await this.attempt(`Could not read '${key}'`, () => reader.read())

      if (done || head.byteLength >= StorageEnvelope.maxHeaderLength) {
        break
      }

      const joined = new Uint8Array(head.byteLength + value.byteLength)
      joined.set(head)
      joined.set(value, head.byteLength)
      head = joined
    }

    try {
      return { envelope: StorageEnvelope.open(key, head), head }
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    }
  }

  /**
   * For reading every entry: one that cannot be read must not hide the others.
   *
   * @returns `undefined` for an entry that cannot be read
   */
  private async readable<Result>(key: string, read: () => Promise<Result>): Promise<Result | undefined> {
    try {
      return await read()
    } catch (error) {
      if (error instanceof StorageCodecError || error instanceof StorageVersionError) {
        this.logger.warn(`Left out the entry '${key}', it cannot be read`, error)

        return undefined
      }

      throw error
    }
  }

  private async list(): Promise<string[]> {
    return this.attempt(`Could not list '${this.namespace}'`, async () => {
      const keys: string[] = []

      for await (const key of this.driver.list(this.scope)) {
        keys.push(key)
      }

      return keys
    })
  }

  private requireStreaming(): void {
    if (!this.capabilities.streaming) {
      throw new StorageUnsupportedError(`The storage driver '${this.driver.name}' cannot stream`)
    }
  }

  private async withKeyLock<Result>(
    key: string,
    mode: LockMode,
    options: StoreWriteOptions,
    task: () => Promise<Result>
  ): Promise<Result> {
    const handle = await this.acquire(key, mode, options)

    try {
      return await task()
    } finally {
      await handle.release()
    }
  }

  private async acquire(key: string, mode: LockMode, options: StoreWriteOptions): Promise<CrossTabLockHandle> {
    if (options.wait !== false) {
      return this.locks.acquire(this.lockNameOf(key), { mode, signal: options.signal })
    }

    const handle = await this.locks.tryAcquire(this.lockNameOf(key), mode)

    if (handle === undefined) {
      throw new StorageLockedError(key)
    }

    return handle
  }

  /**
   * Called after a lock was taken and before the entry is read. Where a backend passes writes on to the other tabs
   * with a delay, the tab that held the lock before may have written something that has not arrived here yet. A
   * short wait makes that unlikely; it cannot rule it out.
   */
  private async settle(): Promise<void> {
    if (!this.capabilities.consistentAcrossTabs && this.locks.isCrossTab) {
      await new Promise((resolve) => setTimeout(resolve, StoreChangeHub.settleTime))
    }
  }

  private lockNameOf(key: string): string {
    return [DefaultStore.lockPrefix, this.driver.name, encodeURIComponent(this.scope), encodeURIComponent(key)].join(
      '/'
    )
  }

  private async attempt<Result>(action: string, operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation()
    } catch (error) {
      throw await this.translate(error, action)
    }
  }

  private async translate(error: unknown, action: string): Promise<StorageError> {
    const translated = StorageErrorFactory.from(error, action)

    if (translated instanceof StorageQuotaExceededError && translated.space === undefined) {
      const space = await this.spaceReader.read()

      return new StorageQuotaExceededError(translated.message, space, { cause: translated.cause })
    }

    return translated
  }
}
