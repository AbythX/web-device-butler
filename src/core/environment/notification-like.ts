/**
 * One notification the page showed with `new Notification()`.
 */
export interface NotificationLike {
  readonly tag: string
  readonly data: unknown
  addEventListener(type: 'click' | 'close', listener: () => void): void
  close(): void
}

/**
 * The constructor of the notifications of the browser, and the permission to show them. Chromium on Android has the
 * constructor and throws when it is called: there, only a service worker can show a notification.
 */
export interface NotificationFactory {
  new (title: string, options?: NotificationOptions): NotificationLike
  readonly permission: NotificationPermission
  requestPermission(): Promise<NotificationPermission>
}

/**
 * A notification a service worker showed, as `registration.getNotifications()` returns it.
 */
export interface WorkerNotificationLike {
  readonly tag: string
  close(): void
}

/**
 * The registration of the service worker of the application, as far as notifications need it.
 */
export interface NotificationRegistrationLike {
  readonly active: object | null
  showNotification(title: string, options?: NotificationOptions): Promise<void>
  getNotifications(filter?: { tag?: string }): Promise<WorkerNotificationLike[]>
}

/**
 * `navigator.serviceWorker`, as far as notifications need it.
 */
export interface ServiceWorkerContainerLike {
  getRegistration(): Promise<NotificationRegistrationLike | undefined>
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}
