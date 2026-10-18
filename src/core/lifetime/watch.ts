import type { Listenable } from '../events/listenable.ts'

export interface WatchEvents<Value> {
  /** a new value; also the first one */
  change: Value
}

/**
 * Follows a value of the device until it is stopped. Created by a part of the butler, never by the application. Each
 * watch adds the events and fields only it has.
 */
export interface Watch<Value, Events extends WatchEvents<Value> = WatchEvents<Value>>
  extends Listenable<Events>, Disposable {
  /**
   * `false` once the watch has stopped, by the application or by itself.
   */
  readonly isActive: boolean

  /**
   * The latest value; `undefined` until the first one arrived.
   */
  readonly current: Value | undefined

  /**
   * Stops following the value and forgets every listener. Stopping a watch that has stopped does nothing.
   */
  stop(): void
}
