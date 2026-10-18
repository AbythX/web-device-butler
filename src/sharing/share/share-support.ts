import type { BrowserEnvironment, ShareSheet } from '../../core/environment/browser-environment.ts'

/**
 * Whether the page can open the share sheet of the system. Shared by every call of the share, so all say the same.
 */
export class ShareSupport {
  /**
   * `false` outside a secure context and where the browser has no share sheet.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return ShareSupport.resolveFor(environment) !== undefined
  }

  /**
   * The share sheet of the system where the page may open it; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): ShareSheet | undefined {
    return environment.secureContext?.shareSheet
  }
}
