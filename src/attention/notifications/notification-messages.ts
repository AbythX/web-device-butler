/**
 * What the service worker of the application sends to its pages about a notification, through
 * `forwardNotificationEvents()` of `web-device-butler/worker`.
 */
export interface NotificationWorkerMessage {
  readonly type: typeof NotificationWorkerMessages.type
  readonly event: 'click' | 'close'
  readonly tag: string
  readonly data: unknown
  /** the action button that was clicked; empty for the notification itself */
  readonly action: string
}

/**
 * What the notifications of the tabs send each other: one tab asks whether another one can be seen, and only the
 * tabs that can be seen answer.
 */
export interface NotificationMessages {
  'notification-visibility-request': { request: string }
  'notification-visibility-answer': { request: string }
}

/**
 * Recognises the messages of the service worker among all the messages a page gets.
 */
export class NotificationWorkerMessages {
  public static readonly type = 'web-device-butler:notification'

  public static is(data: unknown): data is NotificationWorkerMessage {
    return (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === NotificationWorkerMessages.type &&
      'event' in data &&
      (data.event === 'click' || data.event === 'close') &&
      'tag' in data &&
      typeof data.tag === 'string'
    )
  }
}
