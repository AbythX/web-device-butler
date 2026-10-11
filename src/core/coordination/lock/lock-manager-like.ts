export type LockMode = 'exclusive' | 'shared'

export interface LockLike {
  readonly name: string
  readonly mode: LockMode
}

export interface LockRequestOptions {
  mode?: LockMode
  ifAvailable?: boolean
  signal?: AbortSignal
}

export interface LockSnapshot {
  held?: { name?: string; mode?: LockMode }[]
  pending?: { name?: string; mode?: LockMode }[]
}

/**
 * The part of the Web Locks API (`navigator.locks`) the library uses. The browser's `LockManager` satisfies it, and so
 * does the in-tab replacement.
 */
export interface LockManagerLike {
  /**
   * Runs the callback while the lock is held and releases it when the promise of the callback settles.
   *
   * @param callback receives `null` if the lock was requested with `ifAvailable` and is not free
   */
  request(
    name: string,
    options: LockRequestOptions,
    callback: (lock: LockLike | null) => Promise<void>
  ): Promise<unknown>

  /**
   * The locks that are held and waited for.
   */
  query(): Promise<LockSnapshot>
}
