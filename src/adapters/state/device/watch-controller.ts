import { StateController } from '../state-controller.ts'

export interface WatchSnapshot {
  /** why the last `start()` failed; cleared by the next one */
  readonly error: unknown
  readonly isWatching: boolean
}

/**
 * One watch at a time: `start()` it, `stop()` it, and keep what it reported. Shared by the location and the sensors;
 * a subclass opens the watch and follows its events.
 */
export abstract class WatchController<
  Watch extends { stop(): void },
  Options,
  Snapshot extends WatchSnapshot,
> extends StateController<Snapshot> {
  private watch: Watch | undefined

  /**
   * @param extras the first values of what a subclass adds to the snapshot
   */
  protected constructor(extras: Omit<Snapshot, keyof WatchSnapshot>) {
    // SAFETY: the fields of a watch and the extras of the subclass are all the fields of the snapshot
    super({ error: undefined, isWatching: false, ...extras } as Snapshot)
  }

  /**
   * Starts to watch, after stopping the watch that runs. A failure is not thrown, it ends up in `error`.
   */
  public readonly start = (options?: Options): void => {
    this.stop()
    this.changeWatch({ error: undefined })

    try {
      const started = this.open(options)
      this.listen(started)

      this.watch = started
      this.changeWatch({ isWatching: true })
    } catch (failure) {
      this.changeWatch({ error: failure })
    }
  }

  /**
   * Stops the watch; what it reported last stays.
   */
  public readonly stop = (): void => {
    this.watch?.stop()
    this.watch = undefined
    this.changeWatch({ isWatching: false })
  }

  protected abstract open(options?: Options): Watch

  /**
   * Follows the events of a watch that was just started.
   */
  protected abstract listen(watch: Watch): void

  protected override onDeactivate(): void {
    this.stop()
  }

  protected changeWatch(fields: Partial<WatchSnapshot>): void {
    // SAFETY: Snapshot extends the snapshot of a watch, so these fields have the types it declares
    this.change(fields as Partial<Snapshot>)
  }
}
