import type { EventSubscription } from '../../../core/events/event-subscription.ts'
import type { Store } from '../../../storage/store/store.ts'
import { StateController } from '../state-controller.ts'

export interface StoredValueSnapshot<T> {
  /** the stored value; `undefined` while it is loading and where there is no entry */
  readonly value: T | undefined
  /** `true` once the entry was read for the first time */
  readonly isLoaded: boolean
  /** why the last read or write failed */
  readonly error: unknown
}

/**
 * One entry of a store. It follows every change of the entry, also the ones other components and other tabs make.
 * Failures are not thrown, they end up in `error`. Shared by `useStoredValue` of both adapters.
 */
export class StoredValueController<T> extends StateController<StoredValueSnapshot<T>> {
  private entry: { store: Store<T>; key: string } | undefined
  private subscription: EventSubscription | undefined
  /** reads that were overtaken by a later one, or belong to an entry that is no longer shown, are dropped */
  private latestRead = 0

  public constructor() {
    super({ value: undefined, isLoaded: false, error: undefined })
  }

  /**
   * Shows the entry, and stops showing the one before. The value of the one before stays until the entry was read.
   */
  public select(store: Store<T>, key: string): void {
    this.unselect()
    this.entry = { store, key }

    this.subscription = store.on('change', (change) => {
      if (change.key === key) {
        void this.load()
      }
    })

    void this.load()
  }

  /** writes the value; `value` follows once it is stored */
  public readonly set = (value: T): Promise<void> => this.attempt((store, key) => store.set(key, value))

  /** builds on the current value, safely when several tabs do it at once */
  public readonly update = (fn: (current: T | undefined) => T): Promise<void> =>
    this.attempt((store, key) => store.update(key, fn))

  /** removes the entry */
  public readonly remove = (): Promise<void> => this.attempt((store, key) => store.delete(key))

  protected override onDeactivate(): void {
    this.unselect()
  }

  private unselect(): void {
    this.subscription?.unsubscribe()
    this.subscription = undefined
    this.latestRead++
  }

  private load(): Promise<void> {
    return this.attempt(async (store, key) => {
      const read = ++this.latestRead
      const value = await store.get(key)

      if (read === this.latestRead) {
        this.change({ value, isLoaded: true })
      }
    })
  }

  private async attempt(work: (store: Store<T>, key: string) => Promise<unknown>): Promise<void> {
    const entry = this.entry

    if (entry === undefined) {
      return
    }

    try {
      await work(entry.store, entry.key)
      this.change({ error: undefined })
    } catch (failure) {
      this.change({ error: failure })
    }
  }
}
