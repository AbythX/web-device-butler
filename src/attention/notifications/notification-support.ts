import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'

/**
 * Whether the page can show notifications. Shared by the notifications and by the request of their permission, so
 * both say the same.
 */
export class NotificationSupport {
  /**
   * `false` outside a secure context and where the page cannot show notifications, as Safari on iOS outside a web app
   * on the home screen.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return environment.isSecureContext && environment.Notification !== undefined
  }
}
