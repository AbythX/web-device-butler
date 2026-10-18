import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { NotificationFactory } from '../../core/environment/notification-like.ts'

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
    return NotificationSupport.resolveFor(environment) !== undefined
  }

  /**
   * The notifications of the browser where the page may show them; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): NotificationFactory | undefined {
    return environment.secured(environment.Notification)
  }
}
