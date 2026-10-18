import { shallowRef, type ShallowRef } from 'vue'

import type {
  DeviceNotifications,
  NotificationClick,
  NotificationRequest,
  ShownNotification,
} from '../../../attention/notifications/device-notifications.ts'
import { untilScopeEnd } from '../scope.ts'

export interface UseNotifications {
  /** the notification of this page the user clicked last */
  readonly click: ShallowRef<NotificationClick | undefined>
  /** why the last `show()` failed; cleared by the next one */
  readonly error: ShallowRef<unknown>
  /**
   * Shows a notification. A failure is not thrown, it ends up in `error`.
   *
   * @returns the notification, or `undefined` if it was not shown
   */
  show(request: NotificationRequest): Promise<ShownNotification | undefined>
}

/**
 * The notifications as reactive state: `show()` them, and react to `click`. The component stops listening when it is
 * unmounted; the notifications it showed stay.
 */
export const useNotifications = (notifications: DeviceNotifications): UseNotifications => {
  const click = shallowRef<NotificationClick>()
  const error = shallowRef<unknown>()

  untilScopeEnd(notifications.on('click', (clicked) => (click.value = clicked)))

  const show = async (request: NotificationRequest): Promise<ShownNotification | undefined> => {
    error.value = undefined

    try {
      return await notifications.show(request)
    } catch (failure) {
      error.value = failure

      return undefined
    }
  }

  return { click, error, show }
}
