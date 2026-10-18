import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'

/**
 * Whether the device can vibrate. Shared by every call of the vibration, so all say the same.
 */
export class VibrationSupport {
  /**
   * `false` where the browser cannot make the device vibrate, as Safari. Vibrating also works outside a secure
   * context, so it is not checked.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return VibrationSupport.resolveFor(environment) !== undefined
  }

  /**
   * Makes the device vibrate; `undefined` where it cannot.
   */
  public static resolveFor(environment: BrowserEnvironment): ((pattern: number | number[]) => boolean) | undefined {
    return environment.vibrate
  }
}
