import {
  type NotificationWorkerMessage,
  NotificationWorkerMessages,
} from '../attention/notifications/notification-messages.ts'

/**
 * What a `notificationclick` or `notificationclose` event of a service worker carries. The DOM types of the page do
 * not know the types of a worker.
 */
export interface NotificationEventLike {
  readonly notification: { readonly tag: string; readonly data: unknown; close(): void }
  readonly action?: string
  waitUntil(promise: Promise<unknown>): void
}

/**
 * A page of the application, as the service worker sees it.
 */
export interface WindowClientLike {
  readonly focused?: boolean
  readonly visibilityState?: string
  focus(): Promise<unknown>
  postMessage(message: unknown): void
}

/**
 * The global scope of a service worker, as far as notifications need it.
 */
export interface NotificationWorkerScope {
  readonly clients: {
    matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly WindowClientLike[]>
    openWindow(url: string): Promise<WindowClientLike | null>
  }
  readonly registration?: { readonly scope: string }
  addEventListener(
    type: 'notificationclick' | 'notificationclose',
    listener: (event: NotificationEventLike) => void
  ): void
}

export interface NotificationForwardingOptions {
  /** the page to open when the user clicks and no page of the application is open; default: the scope of the worker */
  openUrl?: string
}

const messageOf = (event: NotificationEventLike, kind: 'click' | 'close'): NotificationWorkerMessage => ({
  type: NotificationWorkerMessages.type,
  event: kind,
  tag: event.notification.tag,
  data: event.notification.data,
  action: event.action ?? '',
})

/**
 * Hands the clicks on the notifications of the service worker to the pages of the application, where
 * `butler.notifications` reports them as `click`. Call it once in the service worker:
 *
 * ```ts
 * // sw.ts
 * import { forwardNotificationEvents } from 'web-device-butler/worker'
 *
 * forwardNotificationEvents(self)
 * ```
 *
 * A click closes the notification, brings the page that was used last to the front and tells it; where no page is
 * open, it opens one. A page that is opened this way is not told about the click: put what it needs into `openUrl`.
 */
export const forwardNotificationEvents = (
  scope: NotificationWorkerScope,
  options: NotificationForwardingOptions = {}
): void => {
  const pages = () => scope.clients.matchAll({ type: 'window', includeUncontrolled: true })

  scope.addEventListener('notificationclick', (event) => {
    event.notification.close()

    event.waitUntil(
      (async () => {
        const open = await pages()

        const page =
          open.find((client) => client.focused) ??
          open.find((client) => client.visibilityState === 'visible') ??
          open[0]

        if (page === undefined) {
          await scope.clients.openWindow(options.openUrl ?? scope.registration?.scope ?? '/')

          return
        }

        await page.focus()
        page.postMessage(messageOf(event, 'click'))
      })()
    )
  })

  scope.addEventListener('notificationclose', (event) => {
    event.waitUntil(
      (async () => {
        for (const page of await pages()) {
          page.postMessage(messageOf(event, 'close'))
        }
      })()
    )
  })
}
