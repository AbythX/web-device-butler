import type { MotionWatch, MotionWatchOptions } from '../../../motion/watch/motion-watch.ts'
import { WatchController, type WatchSnapshot } from './watch-controller.ts'

export interface MotionSnapshot<Value> extends WatchSnapshot {
  /** the latest value; `undefined` until the first one arrived */
  readonly value: Value | undefined
  /** `false` once the watch found that the device reports nothing, `undefined` until it knows */
  readonly isAvailable: boolean | undefined
}

/**
 * A watch of `butler.motion`. Shared by `useAttitude` and `useMovement` of both adapters.
 */
export class MotionController<Value> extends WatchController<
  MotionWatch<Value>,
  MotionWatchOptions,
  MotionSnapshot<Value>
> {
  /**
   * @param opener what opens a watch; a getter, so a component can hand over another one
   */
  public constructor(private readonly opener: () => (options?: MotionWatchOptions) => MotionWatch<Value>) {
    super({ value: undefined, isAvailable: undefined })
  }

  protected open(options?: MotionWatchOptions): MotionWatch<Value> {
    return this.opener()(options)
  }

  protected listen(watch: MotionWatch<Value>): void {
    watch.on('change', (value) => this.change({ value, isAvailable: true }))
    watch.on('unavailable', () => this.change({ isAvailable: false }))
  }
}
