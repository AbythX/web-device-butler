import '../../disposable-polyfill.ts'

import type { LockMode } from './lock-manager-like.ts'

/**
 * A lock that is currently held. It stays held until it is released or disposed, or until the tab goes away.
 */
export class CrossTabLockHandle implements Disposable {
  public constructor(
    public readonly name: string,
    public readonly mode: LockMode,
    private releaseLock: (() => void) | undefined,
    private readonly whenReleased: () => Promise<unknown>
  ) {}

  /**
   * Whether the lock was given back already.
   */
  public get isReleased(): boolean {
    return this.releaseLock === undefined
  }

  /**
   * @returns a promise that resolves once the lock is free for others. Without waiting for it, an attempt to take
   *   the lock right after releasing it can still find it held.
   */
  public release(): Promise<void> {
    const releaseLock = this.releaseLock
    this.releaseLock = undefined
    releaseLock?.()

    return this.whenReleased().then(
      () => undefined,
      () => undefined
    )
  }

  /**
   * Calls {@link release} without waiting for it, so the handle can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    void this.release()
  }
}
