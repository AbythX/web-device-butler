import '../../core/disposable-polyfill.ts'

import type { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { NotificationRegistrationLike } from '../../core/environment/notification-like.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import type { PageLifecycle } from '../../platform/page/page-lifecycle.ts'
import type {
  DeviceNotifications,
  DeviceNotificationsEvents,
  NotificationRequest,
  ShownNotification,
} from './device-notifications.ts'
import { type NotificationMessages, NotificationWorkerMessages } from './notification-messages.ts'

export interface NotificationTiming {
  /** how long the other tabs have to say that they can be seen, in milliseconds */
  answerTimeout?: number
  /** how long the service worker has to say whether there is one, in milliseconds */
  registrationTimeout?: number
}

/**
 * The implementation of {@link DeviceNotifications}.
 */
export class DefaultDeviceNotifications extends EventEmitter<DeviceNotificationsEvents> implements DeviceNotifications {
  private static readonly defaultAnswerTimeout = 250
  private static readonly defaultRegistrationTimeout = 1000
  private static shown = 0

  private answering: EventSubscription | undefined
  private isDisposed = false

  /**
   * @param channel asks the other tabs whether they can be seen, and answers them
   * @param page tells whether the user can see this tab
   */
  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly channel: CrossTabChannel<NotificationMessages>,
    private readonly page: PageLifecycle,
    private readonly logger: Logger,
    private readonly timing: NotificationTiming = {}
  ) {
    super()
  }

  public get isSupported(): boolean {
    this.answer()

    return this.environment.isSecureContext && this.environment.Notification !== undefined
  }

  public async show(request: NotificationRequest): Promise<ShownNotification | undefined> {
    this.answer()

    const Notification = this.environment.Notification

    if (Notification === undefined || !this.environment.isSecureContext) {
      throw new UnsupportedError('Notification')
    }

    if (Notification.permission !== 'granted') {
      throw new PermissionDeniedError('notifications')
    }

    const { title, when = 'always', ...options } = request

    if (when !== 'always' && (this.page.isVisible || (when === 'unseen' && (await this.isSeenElsewhere())))) {
      this.logger.debug(`Not showing '${title}': the user can see the application`)

      return undefined
    }

    const tag = options.tag ?? `web-device-butler-${Date.now()}-${DefaultDeviceNotifications.shown++}`
    const registration = await this.registration()

    if (registration !== undefined) {
      await registration.showNotification(title, { ...options, tag })

      return {
        tag,
        close: async () => (await registration.getNotifications({ tag })).forEach((shown) => shown.close()),
      }
    }

    return this.showFromPage(title, { ...options, tag })
  }

  public async isSeenElsewhere(): Promise<boolean> {
    this.answer()

    const request = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    return new Promise((resolve) => {
      const settle = (isSeen: boolean) => {
        clearTimeout(timer)
        subscription.unsubscribe()
        resolve(isSeen)
      }

      const subscription = this.channel.on('notification-visibility-answer', (answer) => {
        if (answer.request === request) {
          settle(true)
        }
      })

      // a tab that is frozen or gone does not answer, and silence means nobody sees one
      const timer = setTimeout(
        () => settle(false),
        this.timing.answerTimeout ?? DefaultDeviceNotifications.defaultAnswerTimeout
      )

      this.channel.post('notification-visibility-request', { request })
    })
  }

  public dispose(): void {
    this.isDisposed = true
    this.answering?.unsubscribe()
    this.answering = undefined
    this.removeAllListeners()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  protected override onFirstListener(): void {
    this.answer()
    this.environment.serviceWorker?.addEventListener('message', this.receive)
  }

  protected override onLastListenerRemoved(): void {
    this.environment.serviceWorker?.removeEventListener('message', this.receive)
  }

  /**
   * Answers the other tabs from now on, while this one can be seen. It starts with the first use, so creating the
   * butler touches nothing of the browser.
   */
  private answer(): void {
    if (this.answering !== undefined || this.isDisposed) {
      return
    }

    this.answering = this.channel.on('notification-visibility-request', ({ request }) => {
      if (this.page.isVisible) {
        this.channel.post('notification-visibility-answer', { request })
      }
    })
  }

  /**
   * The service worker of the application, if it has one that runs. A worker that is still being installed is not
   * waited for: it may never become active.
   */
  private async registration(): Promise<NotificationRegistrationLike | undefined> {
    const serviceWorker = this.environment.serviceWorker

    if (serviceWorker === undefined) {
      return undefined
    }

    let timer: ReturnType<typeof setTimeout> | undefined

    try {
      const timeout = new Promise<undefined>((resolve) => {
        timer = setTimeout(
          resolve,
          this.timing.registrationTimeout ?? DefaultDeviceNotifications.defaultRegistrationTimeout
        )
      })

      const registration = await Promise.race([serviceWorker.getRegistration(), timeout])

      return registration?.active === null || registration === undefined ? undefined : registration
    } catch (error) {
      this.logger.debug('Could not ask for the service worker', error)

      return undefined
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * @throws UnsupportedError where the browser only lets a service worker show notifications, as Chromium on Android
   */
  private showFromPage(title: string, options: NotificationOptions & { tag: string }): ShownNotification {
    const Notification = this.environment.Notification

    if (Notification === undefined) {
      throw new UnsupportedError('Notification')
    }

    let notification: InstanceType<typeof Notification>

    try {
      notification = new Notification(title, options)
    } catch (error) {
      throw new UnsupportedError('Notification without a service worker', { cause: error })
    }

    const { tag } = options

    notification.addEventListener('click', () => {
      // a browser leaves the page where it is; the user clicked to go back to it
      this.environment.window.focus()
      notification.close()
      this.emitSafely('click', { tag, data: options.data, action: '' }, this.logger)
    })

    notification.addEventListener('close', () => this.emitSafely('close', { tag }, this.logger))

    return {
      tag,
      close: () => {
        notification.close()

        return Promise.resolve()
      },
    }
  }

  private readonly receive = ({ data }: MessageEvent): void => {
    if (!NotificationWorkerMessages.is(data)) {
      return
    }

    const { event, tag, action } = data

    if (event === 'click') {
      this.emitSafely('click', { tag, data: data.data, action }, this.logger)
    } else {
      this.emitSafely('close', { tag }, this.logger)
    }
  }
}
