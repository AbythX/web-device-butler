import { StorageError } from '../errors/storage-error.ts'
import type { LockedEntry, LockedEntryOperations } from './locked-entry.ts'

/**
 * The implementation of {@link LockedEntry}.
 */
export class DefaultLockedEntry<T> implements LockedEntry<T> {
  private isReleased = false

  public constructor(
    public readonly key: string,
    private readonly operations: LockedEntryOperations<T>
  ) {}

  public get(): Promise<T | undefined> {
    return this.whileLocked(() => this.operations.get())
  }

  public set(value: T, options: { ttl?: number } = {}): Promise<void> {
    return this.whileLocked(() => this.operations.set(value, options.ttl))
  }

  public delete(): Promise<boolean> {
    return this.whileLocked(() => this.operations.delete())
  }

  /** @internal */
  public release(): void {
    this.isReleased = true
  }

  private whileLocked<Result>(operation: () => Promise<Result>): Promise<Result> {
    if (this.isReleased) {
      return Promise.reject(new StorageError(`The lock of the entry '${this.key}' has already been released`))
    }

    return operation()
  }
}
