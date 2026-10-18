import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'

/**
 * Whether the page can keep the screen on. Shared by the wake lock and, through it, by the request of its permission,
 * so both say the same.
 */
export class WakeLockSupport {
  /**
   * `false` outside a secure context and where the browser cannot keep the screen on.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return WakeLockSupport.resolveFor(environment) !== undefined
  }

  /**
   * The Screen Wake Lock API where the page may use it; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): WakeLock | undefined {
    return environment.secureContext?.wakeLock
  }
}
