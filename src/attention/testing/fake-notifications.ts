import type {
  NotificationLike,
  NotificationRegistrationLike,
  ServiceWorkerContainerLike,
  WorkerNotificationLike,
} from '../../core/environment/notification-like.ts'

/**
 * `Notification` for specs: it records every notification and lets a spec click and close them.
 */
export class FakeNotification implements NotificationLike {
  public static permission: NotificationPermission = 'granted'
  public static answer: NotificationPermission = 'granted'
  public static readonly instances: FakeNotification[] = []
  /** like Chromium on Android: only a service worker can show a notification */
  public static isConstructorRefused = false

  public static reset(): void {
    FakeNotification.permission = 'granted'
    FakeNotification.answer = 'granted'
    FakeNotification.instances.splice(0)
    FakeNotification.isConstructorRefused = false
  }

  public static requestPermission(): Promise<NotificationPermission> {
    FakeNotification.permission = FakeNotification.answer

    return Promise.resolve(FakeNotification.answer)
  }

  public isClosed = false
  public readonly tag: string
  public readonly data: unknown

  private readonly listeners = new Map<'click' | 'close', (() => void)[]>()

  public constructor(
    public readonly title: string,
    public readonly options: NotificationOptions = {}
  ) {
    if (FakeNotification.isConstructorRefused) {
      throw new TypeError("Failed to construct 'Notification': Illegal constructor.")
    }

    this.tag = options.tag ?? ''
    this.data = options.data
    FakeNotification.instances.push(this)
  }

  public addEventListener(type: 'click' | 'close', listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  public close(): void {
    if (!this.isClosed) {
      this.isClosed = true
      this.dispatch('close')
    }
  }

  /** the user clicks it */
  public click(): void {
    this.dispatch('click')
  }

  private dispatch(type: 'click' | 'close'): void {
    this.listeners.get(type)?.forEach((listener) => listener())
  }
}

/**
 * The service worker of an application, for specs: it shows notifications and sends messages to the page.
 */
export class FakeServiceWorker implements ServiceWorkerContainerLike {
  public readonly shown: { title: string; options: NotificationOptions; isClosed: boolean }[] = []
  /** whether the application registered a worker, and whether it runs */
  public state: 'none' | 'installing' | 'active' | 'silent' = 'active'

  private readonly listeners = new Set<(event: MessageEvent) => void>()

  public readonly registration: NotificationRegistrationLike = {
    active: {},
    showNotification: (title, options = {}) => {
      this.shown.push({ title, options, isClosed: false })

      return Promise.resolve()
    },
    getNotifications: (filter = {}) =>
      Promise.resolve(
        this.shown
          .filter((shown) => !shown.isClosed && (filter.tag === undefined || shown.options.tag === filter.tag))
          .map((shown): WorkerNotificationLike => ({
            tag: shown.options.tag ?? '',
            close: () => {
              shown.isClosed = true
            },
          }))
      ),
  }

  public getRegistration(): Promise<NotificationRegistrationLike | undefined> {
    switch (this.state) {
      case 'none':
        return Promise.resolve(undefined)
      case 'installing':
        return Promise.resolve({ ...this.registration, active: null })
      case 'silent':
        // a browser that never answers
        return new Promise(() => undefined)
      default:
        return Promise.resolve(this.registration)
    }
  }

  public addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.add(listener)
  }

  public removeEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.listeners.delete(listener)
  }

  public get listenerCount(): number {
    return this.listeners.size
  }

  /** the worker sends the page a message */
  public post(data: unknown): void {
    this.listeners.forEach((listener) => listener({ data } as MessageEvent))
  }
}
