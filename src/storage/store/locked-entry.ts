export interface LockedEntryOperations<T> {
  /** reads the entry without taking the lock again */
  get(): Promise<T | undefined>
  /** writes the entry without taking the lock again */
  set(value: T, ttl: number | undefined): Promise<void>
  /** removes the entry without taking the lock again */
  delete(): Promise<boolean>
}

/**
 * One entry of a store while its lock is held. It is handed to the task of `store.lock()` and is the way to read
 * and write the entry from inside that task; it stops working when the task has finished.
 */
export interface LockedEntry<T> {
  /** the key of the entry that is locked */
  readonly key: string

  /**
   * The current value, or `undefined` if there is no entry or it has expired.
   *
   * @throws StorageError if the task of the lock has finished
   */
  get(): Promise<T | undefined>

  /**
   * Replaces the entry.
   *
   * @param options `ttl`: after how many milliseconds the entry expires
   * @throws StorageError if the task of the lock has finished
   */
  set(value: T, options?: { ttl?: number }): Promise<void>

  /**
   * @returns whether there was an entry
   */
  delete(): Promise<boolean>
}
