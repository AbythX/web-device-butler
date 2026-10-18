import type { Attitude, Movement } from './model/attitude.ts'
import type { MotionWatch, MotionWatchOptions } from './watch/motion-watch.ts'

/**
 * How the device is turned and how it moves (`butler.motion`), from its sensors: for a spirit level, a compass, a
 * picture that follows the device, or a shake.
 *
 * Safari on iOS reports nothing until the user allowed it: call `butler.permission.request('motion')` in answer to a
 * click first. A desktop has no sensors; its watches say `unavailable`.
 */
export interface DeviceMotion extends Disposable {
  /**
   * `false` where the browser does not report how the device is turned or moves, or the page was not loaded over
   * HTTPS. A browser that has the events on a device without sensors is supported; its watches say `unavailable`.
   */
  readonly isSupported: boolean

  /**
   * Follows how the device is turned: pitch, roll and the heading, for the screen as it is held.
   *
   * @throws UnsupportedError where the browser does not report it
   */
  watchAttitude(options?: MotionWatchOptions): MotionWatch<Attitude>

  /**
   * Follows how the device moves: its acceleration and how fast it turns, along the axes of the screen as it is
   * held.
   *
   * @throws UnsupportedError where the browser does not report it
   */
  watchMotion(options?: MotionWatchOptions): MotionWatch<Movement>

  /**
   * Stops every watch.
   */
  dispose(): void
}
