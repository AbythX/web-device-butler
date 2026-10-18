import type { Listenable } from '../../core/events/listenable.ts'

/**
 * When a notification is shown:
 * - `always`: whenever it is asked for
 * - `hidden`: only while the user cannot see this tab
 * - `unseen`: only while the user can see no tab of this application, which the other tabs are asked about
 */
export type NotificationWhen = 'always' | 'hidden' | 'unseen'

/**
 * What a notification shows. Everything but `title` and `when` goes to the browser as it is.
 */
export interface NotificationRequest {
  title: string
  body?: string
  /**
   * A notification with the same tag replaces the one before it, also one of another tab, and without a sound
   * unless `renotify` is set. Default: a tag of its own.
   */
  tag?: string
  icon?: string
  badge?: string
  /** handed back with `click` */
  data?: unknown
  /** stays until the user acts on it, where the system lets it */
  requireInteraction?: boolean
  silent?: boolean
  /** default: `always` */
  when?: NotificationWhen
}

/**
 * A notification that was shown.
 */
export interface ShownNotification {
  readonly tag: string
  /** removes it, where it is still there */
  close(): Promise<void>
}

export interface NotificationClick {
  readonly tag: string
  readonly data: unknown
  /** the action button that was clicked; empty for the notification itself */
  readonly action: string
}

export interface NotificationClose {
  readonly tag: string
}

export interface DeviceNotificationsEvents {
  /**
   * The user clicked a notification of this page. The page was brought to the front. A notification a service
   * worker showed only arrives here if the worker forwards it with `web-device-butler/worker`.
   */
  click: NotificationClick
  /** a notification of this page was closed, by the user or the system */
  close: NotificationClose
}

/**
 * Shows notifications of the system (`butler.notifications`): with the service worker of the application where it
 * has one, and from the page where it has none. Chromium on Android only allows the first, and throws on the second;
 * the application does not have to know which one works where.
 *
 * Request the permission `notifications` first, in answer to a click: Safari and Firefox only ask then.
 */
export interface DeviceNotifications extends Listenable<DeviceNotificationsEvents>, Disposable {
  /**
   * `false` where the page cannot show notifications: without HTTPS, and in Safari on iOS outside a web app that was
   * added to the home screen.
   */
  readonly isSupported: boolean

  /**
   * Shows a notification, or not, as `when` says.
   *
   * @returns the notification, or `undefined` if it was not shown because the user can see the application
   * @throws UnsupportedError where the page cannot show notifications, also Chromium on Android without a service
   *   worker
   * @throws PermissionDeniedError unless the permission `notifications` was granted
   */
  show(request: NotificationRequest): Promise<ShownNotification | undefined>

  /**
   * Whether the user can see a tab of this application other than this one. The other tabs answer once the
   * notifications of their butler were used; a tab that is frozen does not answer.
   */
  isSeenElsewhere(): Promise<boolean>

  /**
   * Stops answering the other tabs and forgets every listener.
   */
  dispose(): void
}
