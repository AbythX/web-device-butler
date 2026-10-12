import type { Listenable } from '../../core/events/listenable.ts'
import type { WakeLockHold } from './wake-lock-hold.ts'

export interface ScreenWakeLockEvents {
  /** the browser started or stopped keeping the screen on; the payload is the new `isActive` */
  change: boolean
}

/**
 * Keeps the screen from dimming and locking (`butler.wakeLock`), for as long as a camera preview is watched, a
 * recording runs or a route is followed.
 *
 * A browser drops the lock whenever the page goes to the background and does not take it again by itself. This
 * object does: as long as a hold is out, the screen is kept on whenever the user can see the page.
 */
export interface ScreenWakeLock extends Listenable<ScreenWakeLockEvents>, Disposable {
  /**
   * `false` where the browser cannot keep the screen on, or the page was not loaded over HTTPS.
   */
  readonly isSupported: boolean

  /**
   * Whether a hold is out, so the screen is kept on whenever the page is visible.
   */
  readonly isRequested: boolean

  /**
   * Whether the browser keeps the screen on right now. `false` while the page is in the background, even with a
   * hold out.
   */
  readonly isActive: boolean

  /**
   * Keeps the screen on until the returned hold is released. Several holds can be out at once; the screen is kept
   * on until the last one is released.
   *
   * A page that is in the background gets its hold all the same; the screen is kept on once the user returns.
   *
   * @throws UnsupportedError where the browser cannot keep the screen on
   * @throws PermissionDeniedError if the browser refuses, for example while the device saves energy
   */
  request(): Promise<WakeLockHold>

  /**
   * Releases every hold and forgets every listener.
   */
  dispose(): void
}
