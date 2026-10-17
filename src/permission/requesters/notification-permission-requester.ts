import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { DevicePermissionState } from '../permission-state.ts'
import type { PermissionRequester } from './permission-requester.ts'

/**
 * The permission to show notifications. Safari and Firefox only ask in answer to a click.
 */
export class NotificationPermissionRequester implements PermissionRequester {
  public constructor(private readonly environment: BrowserEnvironment) {}

  /**
   * `false` outside a secure context and where the page cannot show notifications, as Safari on iOS outside a web app
   * on the home screen.
   */
  public get isSupported(): boolean {
    return this.environment.isSecureContext && this.environment.Notification !== undefined
  }

  /**
   * @returns `granted` or `denied`; `prompt` if the user closed the prompt without answering, or the browser did not
   *   ask because the call was not made in answer to a click
   */
  public async request(): Promise<DevicePermissionState | undefined> {
    const Notification = this.environment.Notification

    if (Notification === undefined) {
      return 'unsupported'
    }

    try {
      return NotificationPermissionRequester.stateOf(await Notification.requestPermission())
    } catch {
      return undefined
    }
  }

  /**
   * What the browser says without asking, for browsers whose Permissions API does not know notifications.
   */
  public query(): Promise<DevicePermissionState | undefined> {
    const Notification = this.environment.Notification

    return Promise.resolve(
      Notification === undefined ? undefined : NotificationPermissionRequester.stateOf(Notification.permission)
    )
  }

  private static stateOf(permission: NotificationPermission): DevicePermissionState {
    return permission === 'default' ? 'prompt' : permission
  }
}
