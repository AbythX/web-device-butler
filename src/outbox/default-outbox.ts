import '../core/disposable-polyfill.ts'

import type { CrossTabLock } from '../core/coordination/lock/cross-tab-lock.ts'
import { EventEmitter } from '../core/events/event-emitter.ts'
import type { EventSubscription } from '../core/events/event-subscription.ts'
import type { Logger } from '../core/logging/logger.ts'
import type { DeviceNetwork } from '../network/device-network.ts'
import type { Store } from '../storage/store/store.ts'
import type { Outbox, OutboxEntry, OutboxEvents, OutboxOptions } from './outbox.ts'

/**
 * The implementation of {@link Outbox}.
 */
export class DefaultOutbox<T> extends EventEmitter<OutboxEvents<T>> implements Outbox<T> {
  private static readonly firstRetryDelay = 5000
  private static readonly longestRetryDelay = 5 * 60 * 1000

  private flushing: Promise<void> | undefined
  /** something asked to send while this tab was sending; it sends once more when it is done */
  private isAskedAgain = false
  private isDisposed = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  /** after a failure: when the next try is due, so an item that is added does not cut the wait short */
  private retryDue = 0
  private added = 0
  private readonly sending = new AbortController()
  private readonly subscription: EventSubscription

  /**
   * @param store where the entries are kept, by their id
   * @param lock lets one tab at a time send
   */
  public constructor(
    private readonly store: Store<OutboxEntry<T>>,
    private readonly lock: CrossTabLock,
    private readonly network: DeviceNetwork,
    private readonly options: OutboxOptions<T>,
    private readonly logger: Logger
  ) {
    super()

    this.subscription = network.on('change', (isOnline) => {
      if (isOnline) {
        void this.flush()
      }
    })
  }

  public get namespace(): string {
    return this.options.namespace
  }

  public get isSending(): boolean {
    return this.flushing !== undefined
  }

  public async add(item: T): Promise<OutboxEntry<T>> {
    const entry: OutboxEntry<T> = { id: this.nextId(), item, addedAt: Date.now(), attempts: 0 }
    await this.store.set(entry.id, entry)

    void this.send()

    return entry
  }

  public async entries(): Promise<OutboxEntry<T>[]> {
    const entries: OutboxEntry<T>[] = []

    for await (const [, entry] of this.store.entries()) {
      entries.push(entry)
    }

    return entries.sort((first, second) => (first.id < second.id ? -1 : 1))
  }

  public remove(id: string): Promise<boolean> {
    return this.store.delete(id)
  }

  public flush(): Promise<void> {
    this.retryDue = 0

    return this.send()
  }

  /**
   * Sends unless the wait after a failure is still on.
   */
  private send(): Promise<void> {
    if (Date.now() < this.retryDue) {
      return Promise.resolve()
    }

    if (this.flushing !== undefined) {
      this.isAskedAgain = true

      return this.flushing
    }

    this.flushing = this.run()
      .catch((error: unknown) => this.logger.error(`The outbox '${this.namespace}' could not send`, error))
      .finally(() => {
        this.flushing = undefined
      })

    return this.flushing
  }

  public dispose(): void {
    this.isDisposed = true
    clearTimeout(this.retryTimer)
    this.sending.abort()
    this.subscription.unsubscribe()
    this.removeAllListeners()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  private get canSend(): boolean {
    // a browser that does not say whether there is a network is taken to have one
    return !this.isDisposed && this.network.isOnline !== false
  }

  private async run(): Promise<void> {
    do {
      this.isAskedAgain = false

      if (!this.canSend) {
        return
      }

      // another tab that sends takes what this one added as well
      const handle = await this.lock.tryAcquire(`web-device-butler:outbox:${this.namespace}`)

      if (handle === undefined) {
        return
      }

      try {
        await this.sendAll()
      } finally {
        await handle.release()
      }
      // what was asked for while an item failed waits for the retry like the item
    } while (this.isAskedAgain && Date.now() >= this.retryDue)
  }

  /**
   * Sends what waits, oldest first, until nothing is left or an item fails. The list is read again after every
   * item, so what was added in the meantime, in this tab or another, is sent in the same go.
   */
  private async sendAll(): Promise<void> {
    while (this.canSend) {
      const [next] = await this.entries()

      if (next === undefined || !(await this.deliver(next))) {
        return
      }
    }
  }

  /**
   * @returns whether the sending goes on with the next item
   */
  private async deliver(entry: OutboxEntry<T>): Promise<boolean> {
    const attempt = entry.attempts + 1

    try {
      await this.options.send(entry.item, { id: entry.id, attempt, signal: this.sending.signal })
    } catch (error) {
      if (!this.isDisposed) {
        return await this.failed(entry, attempt, error)
      }

      return false
    }

    await this.store.delete(entry.id)
    this.emitSafely('sent', entry, this.logger)

    return true
  }

  private async failed(entry: OutboxEntry<T>, attempt: number, error: unknown): Promise<boolean> {
    const failed: OutboxEntry<T> = { ...entry, attempts: attempt, lastError: DefaultOutbox.describe(error) }
    const willRetry = attempt < (this.options.maxAttempts ?? Number.POSITIVE_INFINITY)

    if (willRetry) {
      await this.store.set(entry.id, failed)
      this.retryAfter(attempt)
    } else {
      this.logger.warn(`The outbox '${this.namespace}' gave up on '${entry.id}' after ${attempt} attempts`, error)
      await this.store.delete(entry.id)
    }

    this.emitSafely('failed', { entry: failed, error, willRetry }, this.logger)

    // an item that is given up does not hold back the ones after it
    return !willRetry
  }

  private retryAfter(attempt: number): void {
    const { retryDelay } = this.options

    const delay =
      typeof retryDelay === 'function'
        ? retryDelay(attempt)
        : (retryDelay ?? Math.min(DefaultOutbox.firstRetryDelay * 2 ** (attempt - 1), DefaultOutbox.longestRetryDelay))

    clearTimeout(this.retryTimer)
    this.retryDue = Date.now() + delay
    this.retryTimer = setTimeout(() => void this.flush(), delay)
  }

  /**
   * Ids sort by the time they were given, and then by the order within this outbox.
   */
  private nextId(): string {
    const time = Date.now().toString(36).padStart(9, '0')
    const order = (this.added++).toString(36).padStart(4, '0')
    const unique = Math.random().toString(36).slice(2, 8)

    return `${time}-${order}-${unique}`
  }

  private static describe(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }
}
