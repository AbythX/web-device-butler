import type { Watch, WatchEvents } from '../../core/lifetime/watch.ts'

export interface MotionWatchEvents<Value> extends WatchEvents<Value> {
  /** the device was turned or moved; at most `rate` times per second */
  change: Value
  /**
   * The device does not report it: no sensor, as on a desktop, or the user has not allowed it, as in Safari on iOS
   * until `butler.permission.request('motion')`. Emitted once; values that arrive later are reported as usual.
   */
  unavailable: undefined
}

export interface MotionWatchOptions {
  /** how many values per second are reported, at most; default: as many as the device measures */
  rate?: number
}

/**
 * Follows a sensor of the device until it is stopped. Created by `butler.motion`, never by the application.
 */
export interface MotionWatch<Value> extends Watch<Value, MotionWatchEvents<Value>> {
  /**
   * `true` once a value arrived, `false` once the watch found that none will, `undefined` until then.
   */
  readonly isAvailable: boolean | undefined
}
