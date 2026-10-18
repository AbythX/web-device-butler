import { useCallback, useEffect, useState } from 'react'

import type {
  DeviceNotifications,
  NotificationClick,
  NotificationRequest,
  ShownNotification,
} from '../../../attention/notifications/device-notifications.ts'

export interface UseNotifications {
  /** the notification of this page the user clicked last */
  readonly click: NotificationClick | undefined
  /** why the last `show()` failed; cleared by the next one */
  readonly error: unknown
  /**
   * Shows a notification. A failure is not thrown, it ends up in `error`.
   *
   * @returns the notification, or `undefined` if it was not shown
   */
  show(request: NotificationRequest): Promise<ShownNotification | undefined>
}

/**
 * The notifications as state of a component: `show()` them, and react to `click`. The component stops listening
 * when it is unmounted; the notifications it showed stay.
 */
export const useNotifications = (notifications: DeviceNotifications): UseNotifications => {
  const [click, setClick] = useState<NotificationClick>()
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    const subscription = notifications.on('click', (clicked) => setClick(clicked))

    return () => subscription.unsubscribe()
  }, [notifications])

  const show = useCallback(
    async (request: NotificationRequest): Promise<ShownNotification | undefined> => {
      setError(undefined)

      try {
        return await notifications.show(request)
      } catch (failure) {
        setError(failure)

        return undefined
      }
    },
    [notifications]
  )

  return { click, error, show }
}
