import type { LockLike, LockManagerLike, LockMode, LockRequestOptions, LockSnapshot } from './lock-manager-like.ts'

interface PendingRequest {
  readonly mode: LockMode
  grant(): void
}

/**
 * A lock manager with the semantics of the Web Locks API that only reaches as far as the objects sharing it. It is
 * the fallback where the browser has no `navigator.locks`, and the shared lock manager of tests.
 */
export class InTabLockManager implements LockManagerLike {
  /**
   * Shared by every `DeviceButler` of the tab, so several instances still coordinate without Web Locks.
   */
  public static readonly shared = new InTabLockManager()

  private readonly held = new Map<string, LockLike[]>()
  private readonly pending = new Map<string, PendingRequest[]>()

  /**
   * Runs the callback while the lock is held, like `navigator.locks.request()`: an exclusive lock waits for every
   * holder, a shared one only for exclusive ones and for requests in front of it. With `ifAvailable` the callback gets
   * `null` instead of waiting.
   *
   * @returns a promise that settles with the callback, or rejects with the reason of the signal if it fires first
   */
  public request(
    name: string,
    options: LockRequestOptions,
    callback: (lock: LockLike | null) => Promise<void>
  ): Promise<unknown> {
    const mode = options.mode ?? 'exclusive'
    const { signal } = options

    if (signal?.aborted) {
      return Promise.reject(signal.reason)
    }

    if (options.ifAvailable && !this.isAvailable(name, mode)) {
      return Promise.resolve().then(() => callback(null))
    }

    return new Promise((resolve, reject) => {
      const queue = this.listOf(this.pending, name)

      const request: PendingRequest = {
        mode,
        grant: () => {
          signal?.removeEventListener('abort', abort)
          resolve(this.hold(name, mode, callback))
        },
      }

      const abort = () => {
        queue.splice(queue.indexOf(request), 1)
        reject(signal?.reason)
        // the aborted request may have been the one that kept the following ones waiting
        this.grantPending(name)
        this.forgetIfUnused(name)
      }

      signal?.addEventListener('abort', abort, { once: true })
      queue.push(request)
      this.grantPending(name)
    })
  }

  /**
   * The locks that are held and waited for in this tab, like `navigator.locks.query()`.
   */
  public query(): Promise<LockSnapshot> {
    return Promise.resolve({
      held: [...this.held.values()].flat().map(({ name, mode }) => ({ name, mode })),
      pending: [...this.pending].flatMap(([name, requests]) => requests.map(({ mode }) => ({ name, mode }))),
    })
  }

  private hold(name: string, mode: LockMode, callback: (lock: LockLike) => Promise<void>): Promise<void> {
    const locks = this.listOf(this.held, name)
    const lock: LockLike = { name, mode }
    locks.push(lock)

    return Promise.resolve()
      .then(() => callback(lock))
      .finally(() => {
        locks.splice(locks.indexOf(lock), 1)
        this.grantPending(name)
        this.forgetIfUnused(name)
      })
  }

  private grantPending(name: string): void {
    const queue = this.pending.get(name) ?? []

    // strictly in order: a shared request does not overtake an exclusive one that waits in front of it
    for (let next = queue[0]; next !== undefined && this.canHold(name, next.mode); next = queue[0]) {
      queue.shift()
      next.grant()
    }
  }

  private isAvailable(name: string, mode: LockMode): boolean {
    return (this.pending.get(name)?.length ?? 0) === 0 && this.canHold(name, mode)
  }

  private canHold(name: string, mode: LockMode): boolean {
    const locks = this.held.get(name) ?? []

    return locks.length === 0 || (mode === 'shared' && locks.every((lock) => lock.mode === 'shared'))
  }

  /**
   * Lock names are made of the keys of stores, so there is no end to them.
   */
  private forgetIfUnused(name: string): void {
    if (this.held.get(name)?.length === 0) {
      this.held.delete(name)
    }

    if (this.pending.get(name)?.length === 0) {
      this.pending.delete(name)
    }
  }

  private listOf<Entry>(lists: Map<string, Entry[]>, name: string): Entry[] {
    let list = lists.get(name)

    if (list === undefined) {
      list = []
      lists.set(name, list)
    }

    return list
  }
}
