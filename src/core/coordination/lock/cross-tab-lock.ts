import { CrossTabLockHandle } from './cross-tab-lock-handle.ts'
import { DeviceEnvironment } from '../../environment/device-environment.ts'
import { InTabLockManager } from './in-tab-lock-manager.ts'
import type { LockManagerLike, LockMode, LockRequestOptions } from './lock-manager-like.ts'
import type { Logger } from '../../logging/logger.ts'
import { NullLogger } from '../../logging/null-logger.ts'
import { ScopedLogger } from '../../logging/scoped-logger.ts'

export interface CrossTabLockOptions {
  /** default: `exclusive` */
  mode?: LockMode
  /** stops waiting for the lock; the returned promise rejects with the reason of the signal */
  signal?: AbortSignal
}

/**
 * Named locks that are visible to every tab of the origin, built on the Web Locks API. The browser releases a lock
 * when the tab that holds it closes or crashes, so nothing can be left behind.
 *
 * Where the browser has no Web Locks, the locks only work inside the tab and {@link isCrossTab} is `false`.
 */
export class CrossTabLock {
  /**
   * The lock of an origin, as every part of the library builds it.
   */
  public static create(environment: DeviceEnvironment, logger: Logger): CrossTabLock {
    return new CrossTabLock(environment, new ScopedLogger('CrossTabLock', logger))
  }

  /**
   * A lock for resources that are not shared between tabs, such as `sessionStorage`. It coordinates the objects
   * inside this tab and deliberately does not reach further.
   */
  public static inTab(manager: LockManagerLike = InTabLockManager.shared): CrossTabLock {
    return new CrossTabLock(DeviceEnvironment.of({}), new NullLogger(), manager)
  }

  private hasReportedFallback = false

  public constructor(
    private readonly environment: DeviceEnvironment,
    private readonly logger: Logger,
    private readonly fallback: LockManagerLike = InTabLockManager.shared
  ) {}

  /**
   * Whether the lock reaches other tabs. Without the Web Locks API it only holds inside this tab.
   */
  public get isCrossTab(): boolean {
    return this.environment.locks !== undefined
  }

  /**
   * Waits until the lock is free and returns it held.
   */
  public async acquire(name: string, options: CrossTabLockOptions = {}): Promise<CrossTabLockHandle> {
    const handle = await this.request(name, { mode: options.mode ?? 'exclusive', signal: options.signal })

    if (handle === undefined) {
      // a lock manager only answers without a lock when asked with `ifAvailable`
      throw new TypeError(`The lock '${name}' was not granted`)
    }

    return handle
  }

  /**
   * @returns the held lock, or `undefined` if it is not free right now
   */
  public tryAcquire(name: string, mode: LockMode = 'exclusive'): Promise<CrossTabLockHandle | undefined> {
    return this.request(name, { mode, ifAvailable: true })
  }

  /**
   * Runs the task while holding the lock.
   */
  public async run<Result>(
    name: string,
    task: () => Result | Promise<Result>,
    options: CrossTabLockOptions = {}
  ): Promise<Result> {
    const handle = await this.acquire(name, options)

    try {
      return await task()
    } finally {
      await handle.release()
    }
  }

  /**
   * Whether anyone, in this tab or another, holds the lock right now in a way that keeps a request of the given mode
   * waiting. A lock that is only held as `shared` does not keep another `shared` request waiting.
   */
  public async isHeld(name: string, mode: LockMode = 'exclusive'): Promise<boolean> {
    const { held = [] } = await this.manager.query()

    return held.some((lock) => lock.name === name && (mode === 'exclusive' || lock.mode === 'exclusive'))
  }

  private request(name: string, options: LockRequestOptions): Promise<CrossTabLockHandle | undefined> {
    const mode = options.mode ?? 'exclusive'

    return new Promise((resolve, reject) => {
      // settles once the lock manager has released the lock again
      const settled = this.manager.request(name, options, (lock) => {
        if (lock === null) {
          resolve(undefined)

          return Promise.resolve()
        }

        // the lock manager holds the lock for as long as this promise is pending
        return new Promise<void>((release) => {
          resolve(new CrossTabLockHandle(name, mode, release, () => settled))
        })
      })

      settled.catch(reject)
    })
  }

  private get manager(): LockManagerLike {
    const locks = this.environment.locks

    if (locks !== undefined) {
      return locks
    }

    if (!this.hasReportedFallback) {
      this.hasReportedFallback = true
      this.logger.warn('The Web Locks API is not available, locks only coordinate inside this tab')
    }

    return this.fallback
  }
}
