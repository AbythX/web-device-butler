import '../../core/disposable-polyfill.ts'

import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import type { StorageSpace } from './storage-space.ts'
import type { StorageSpaceReader } from './storage-space-reader.ts'
import type { StorageSpaceWatch, StorageSpaceWatchEvents, StorageSpaceWatchOptions } from './storage-space-watch.ts'

/**
 * The implementation of {@link StorageSpaceWatch}.
 */
export class DefaultStorageSpaceWatch extends EventEmitter<StorageSpaceWatchEvents> implements StorageSpaceWatch {
  private static readonly defaultInterval = 10_000

  private timer: ReturnType<typeof setInterval> | undefined
  private latest: StorageSpace | undefined
  private pending: Promise<void> | undefined
  private isStopped = false

  private readonly remoteWrites: EventSubscription | undefined

  /**
   * @param onRemoteWrite registers a listener for writes that another tab announced, so the watch does not wait for
   *   the next interval after one
   * @param logger receives the failures of listeners
   * @param stopped called once, when the watch has stopped
   */
  public constructor(
    private readonly reader: StorageSpaceReader,
    private readonly options: StorageSpaceWatchOptions = {},
    onRemoteWrite?: (listener: () => void) => EventSubscription,
    private readonly logger: Logger = new NullLogger(),
    private readonly stopped: (watch: StorageSpaceWatch) => void = () => undefined
  ) {
    super()

    this.remoteWrites = onRemoteWrite?.(() => void this.refresh())

    this.timer = setInterval(() => void this.refresh(), options.interval ?? DefaultStorageSpaceWatch.defaultInterval)
    void this.refresh()
  }

  public get isActive(): boolean {
    return !this.isStopped
  }

  public get current(): StorageSpace | undefined {
    return this.latest
  }

  public refresh(): Promise<void> {
    // reads never overlap, a refresh during a read waits for that read
    this.pending ??= this.read().finally(() => {
      this.pending = undefined
    })

    return this.pending
  }

  public stop(): void {
    if (this.isStopped) {
      return
    }

    this.isStopped = true
    this.stopped(this)
    clearInterval(this.timer)
    this.timer = undefined
    this.remoteWrites?.unsubscribe()
    this.removeAllListeners()
  }

  /**
   * Calls {@link stop}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.stop()
  }

  private async read(): Promise<void> {
    const space = await this.reader.read()

    if (this.isStopped) {
      return
    }

    const previous = this.latest
    this.latest = space

    if (previous === undefined || !previous.equals(space)) {
      this.emitSafely('change', space, this.logger)
    }

    if (this.isLow(space) && (previous === undefined || !this.isLow(previous))) {
      this.emitSafely('low', space, this.logger)
    }
  }

  private isLow(space: StorageSpace): boolean {
    const { lowBelow } = this.options

    return lowBelow !== undefined && space.available !== undefined && space.available < lowBelow
  }
}
