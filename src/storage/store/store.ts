import type { Listenable } from '../../core/events/listenable.ts'
import type { StorageCapabilities } from '../storage-capabilities.ts'
import type { LockedEntry } from './locked-entry.ts'
import type { StoreChange } from './store-change.ts'

export interface StoreWriteOptions {
  /**
   * What to do while the entry is in use, in this tab or another. `true` (default) waits, `false` fails with
   * `StorageLockedError`.
   */
  wait?: boolean
  /** stops waiting for the entry; the call rejects with the reason of the signal */
  signal?: AbortSignal
}

export interface StoreSetOptions extends StoreWriteOptions {
  /** milliseconds after which the entry counts as missing */
  ttl?: number
}

export interface StoreEvents {
  /** an entry was set or deleted, by this store, by another store on the same data or in another tab */
  change: StoreChange
}

/**
 * What an application works with: the entries of one namespace of one backend. A store behaves the same on every
 * backend: it owns the codec, expiry, locking and change events and leaves the raw reads and writes to its driver.
 *
 * Stores are opened with `butler.storage.open()`.
 */
export interface Store<T = unknown> extends Listenable<StoreEvents> {
  /** the name the store was opened with */
  readonly namespace: string

  /**
   * What the backend of this store can do. `capabilities.driver` tells which entry of a fallback chain was chosen.
   */
  readonly capabilities: StorageCapabilities

  /**
   * The value of the entry, or `undefined` if there is none or it has expired.
   *
   * @throws StorageCodecError if the entry cannot be decoded
   */
  get(key: string): Promise<T | undefined>

  /**
   * Replaces the entry in one step: a reader, in this tab or another, sees the old value or the new one. Two tabs
   * that set the same key overwrite each other, the last one wins; use {@link update} to build on the current value.
   */
  set(key: string, value: T, options?: StoreSetOptions): Promise<void>

  /**
   * Whether there is an entry that has not expired. Reads only the head of the entry, not its value.
   */
  has(key: string): Promise<boolean>

  /**
   * @returns whether there was an entry
   */
  delete(key: string, options?: StoreWriteOptions): Promise<boolean>

  /**
   * Reads the entry, applies `fn` and writes the result, as one step across all tabs: two tabs that increment the
   * same value both count.
   *
   * @returns the new value
   */
  update(key: string, fn: (current: T | undefined) => T | Promise<T>, options?: StoreSetOptions): Promise<T>

  /**
   * Runs the task while no one else, in this tab or another, can write the entry. The task reads and writes the
   * entry through the object it receives.
   *
   * The lock is not reentrant: calling `set`, `delete`, `update` or `lock` of the store for the same key inside the
   * task waits for the task itself and never returns.
   */
  lock<Result>(
    key: string,
    task: (entry: LockedEntry<T>) => Result | Promise<Result>,
    options?: StoreWriteOptions
  ): Promise<Result>

  /**
   * The bytes this store occupies in its backend.
   */
  size(): Promise<number>

  /**
   * Deletes every entry of this store, and nothing outside its namespace. Entries that are in use are waited for,
   * one after another.
   */
  clear(options?: StoreWriteOptions): Promise<void>

  /**
   * The keys of the entries this store can read. An entry that was not written by this library, or in a newer
   * format, is left out and reported to the logger.
   */
  keys(): AsyncIterable<string>

  /**
   * The entries this store can read. An entry that cannot be decoded is left out and reported to the logger;
   * {@link get} tells why.
   */
  entries(): AsyncIterable<[string, T]>

  /**
   * The bytes of an entry as a stream, without loading it into memory. Writers of the entry wait until the stream
   * has been read to its end or cancelled.
   *
   * @throws StorageUnsupportedError unless `capabilities.streaming`
   */
  readStream(key: string, options?: StoreWriteOptions): Promise<ReadableStream<Uint8Array> | undefined>

  /**
   * Writes an entry as a stream of bytes, for values that should not be held in memory, such as a recording. The
   * entry is replaced when the stream is closed and stays as it was if the stream is aborted. Until then no one
   * else, in this tab or another, can write or delete the entry. Read it back with {@link readStream}, or with
   * {@link get} if the store uses a codec for bytes.
   *
   * The stream has to be closed or aborted. An abandoned stream keeps the entry locked until the tab is closed.
   *
   * @throws StorageUnsupportedError unless `capabilities.streaming`
   */
  writeStream(key: string, options?: StoreSetOptions): Promise<WritableStream<Uint8Array>>
}
