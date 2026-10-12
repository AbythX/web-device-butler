import type { ScreenWakeLock } from '../../screen/wake-lock/screen-wake-lock.ts'
import { PermissionDeniedError } from '../errors/permission-denied-error.ts'
import type { DevicePermissionState } from '../permission-state.ts'
import type { PermissionRequester } from './permission-requester.ts'

/**
 * Keeps the screen on for a moment, which is the only way to find out whether the browser lets the page.
 */
export class WakeLockPermissionRequester implements PermissionRequester {
  public constructor(private readonly wakeLock: ScreenWakeLock) {}

  /**
   * `false` where the browser cannot keep the screen on.
   */
  public get isSupported(): boolean {
    return this.wakeLock.isSupported
  }

  /**
   * @returns `granted` or `denied`; `undefined` if it failed for another reason and only the Permissions API can
   *   tell
   */
  public async request(): Promise<DevicePermissionState | undefined> {
    try {
      const hold = await this.wakeLock.request()
      hold.release()

      return 'granted'
    } catch (error) {
      return error instanceof PermissionDeniedError ? 'denied' : undefined
    }
  }
}
