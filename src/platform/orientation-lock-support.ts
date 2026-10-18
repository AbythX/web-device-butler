import type { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import type { ScreenOrientationLike } from '../core/environment/screen-orientation-like.ts'

/**
 * Whether the page can keep itself from turning. Shared by `canLock` and `lock()` of the orientation, so both say the
 * same.
 */
export class OrientationLockSupport {
  /**
   * `false` where the browser has no call to lock the orientation. A device that cannot be turned, such as a desktop,
   * may have the call and reject it. Locking also works outside a secure context, so it is not checked.
   */
  public static canLockIn(environment: BrowserEnvironment): boolean {
    return OrientationLockSupport.resolveFor(environment) !== undefined
  }

  /**
   * The orientation of the screen where it has the call to lock it; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): Required<Pick<ScreenOrientationLike, 'lock'>> | undefined {
    const screenOrientation = environment.screenOrientation

    return typeof screenOrientation?.lock === 'function'
      ? { lock: screenOrientation.lock.bind(screenOrientation) }
      : undefined
  }
}
