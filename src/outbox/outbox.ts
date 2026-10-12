import type { Listenable } from '../core/events/listenable.ts'
import type { StorageRequirements } from '../storage/selection/storage-requirements.ts'

/**
 * Something that waits to be sent.
 */
export interface OutboxEntry<T> {
  /** given by the outbox; later entries have ids that sort after earlier ones */
  readonly id: string
  readonly item: T
  /** when it was added, in milliseconds since 1970 */
  readonly addedAt: number
  /** how often sending it has failed so far */
  readonly attempts: number
  /** what the last failure said */
  readonly lastError?: string
}

export interface OutboxSendContext {
  /** the id of the entry, to tell a server which of two deliveries of the same item it has seen already */
  readonly id: string
  /** `1` for the first try */
  readonly attempt: number
  /** aborts when the outbox is disposed */
  readonly signal: AbortSignal
}

export interface OutboxOptions<T> {
  /** outboxes of different namespaces never see each other */
  namespace: string
  /**
   * Sends one item, for example with `fetch`. It rejects if the item was not sent; the item stays and is tried
   * again later. An item can be delivered twice, if the page dies between the delivery and noting it down, so the
   * receiving side should recognise the `id`.
   */
  send(item: T, context: OutboxSendContext): Promise<void>
  /**
   * How long to wait before the next try after a failure, in milliseconds, as a number or by the number of the
   * attempt that failed. Default: 5 seconds, doubled with every failure, 5 minutes at most.
   */
  retryDelay?: number | ((attempt: number) => number)
  /** how often an item is tried before it is given up and removed; default: it is never given up */
  maxAttempts?: number
  /**
   * Where the items are kept. Default: a backend that survives the page and is consistent across tabs where the
   * browser has one, the memory of the page otherwise.
   */
  storage?: StorageRequirements
}

export interface OutboxFailure<T> {
  readonly entry: OutboxEntry<T>
  readonly error: unknown
  /** `false` if the item was given up and removed, because it reached `maxAttempts` */
  readonly willRetry: boolean
}

export interface OutboxEvents<T> {
  /** an item was sent and removed */
  sent: OutboxEntry<T>
  /** sending an item failed */
  failed: OutboxFailure<T>
}

/**
 * Items that are sent as soon as that is possible, and kept until then: what a user did while the device had no
 * network is not lost, also not when the page is closed in between.
 *
 * Items are sent one after another, in the order they were added, and only by one tab at a time. A failure stops
 * the sending and keeps the order: the item is tried again after a while, when the network returns, or with
 * {@link flush}.
 */
export interface Outbox<T> extends Listenable<OutboxEvents<T>>, Disposable {
  readonly namespace: string

  /**
   * Whether this tab is sending right now.
   */
  readonly isSending: boolean

  /**
   * Keeps the item and starts sending. The item has to be something JSON can write.
   *
   * @returns the entry, once it is kept
   */
  add(item: T): Promise<OutboxEntry<T>>

  /**
   * What waits to be sent, in the order it is sent.
   */
  entries(): Promise<OutboxEntry<T>[]>

  /**
   * Takes an item out without sending it.
   *
   * @returns whether it was there
   */
  remove(id: string): Promise<boolean>

  /**
   * Tries to send now, instead of waiting for the next retry.
   *
   * @returns a promise that resolves when this tab has stopped sending: everything is sent, an item failed, the
   *   device has no network, or another tab is sending
   */
  flush(): Promise<void>

  /**
   * Stops sending and forgets every listener. What waits to be sent stays, for the next time the outbox is opened.
   */
  dispose(): void
}

/**
 * The entry to the outboxes (`butler.outbox`).
 */
export interface OutboxManager extends Disposable {
  /**
   * Opens an outbox and starts sending what was left in it.
   *
   * @throws StorageUnsupportedError if no backend has what `storage` requires
   */
  open<T>(options: OutboxOptions<T>): Promise<Outbox<T>>

  /**
   * Disposes every outbox that was opened here.
   */
  dispose(): void
}
