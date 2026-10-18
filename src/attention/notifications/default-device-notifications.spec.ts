import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import type { BrowserGlobals } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { FakeOrigin } from '../../core/testing/fake-origin.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import type { PageLifecycle } from '../../platform/page/page-lifecycle.ts'
import { FakeNotification, FakeServiceWorker } from '../testing/fake-notifications.ts'
import { DefaultDeviceNotifications } from './default-device-notifications.ts'
import type { NotificationClick, NotificationClose } from './device-notifications.ts'
import type { NotificationMessages } from './notification-messages.ts'
import { NotificationWorkerMessages } from './notification-messages.ts'

describe('default-device-notifications', () => {
  /** the origin of the tabs of one spec */
  let origin!: FakeOrigin
  let worker!: FakeServiceWorker | undefined
  let focus!: ReturnType<typeof vi.fn>
  const tabs: { notifications: DefaultDeviceNotifications; channel: CrossTabChannel<NotificationMessages> }[] = []

  /** a tab of the application, which the user can see or not */
  const openTab = (page: { isVisible: boolean } = { isVisible: false }, globals: Partial<BrowserGlobals> = {}) => {
    const environment = origin.openEnvironment(
      {
        window: { focus } as unknown as Window,
        navigator: { serviceWorker: worker } as unknown as Navigator,
        Notification: FakeNotification,
      },
      globals
    )

    const channel = new CrossTabChannel<NotificationMessages>('notifications', environment, new NullLogger())

    const notifications = new DefaultDeviceNotifications(
      environment,
      channel,
      page as PageLifecycle,
      new NullLogger(),
      { answerTimeout: 20, registrationTimeout: 20 }
    )

    tabs.push({ notifications, channel })

    return notifications
  }

  beforeEach(() => {
    FakeNotification.reset()
    origin = new FakeOrigin()
    worker = undefined
    focus = vi.fn()
  })

  afterEach(() => {
    tabs.splice(0).forEach(({ notifications, channel }) => {
      notifications.dispose()
      channel.close()
    })
  })

  describe('#isSupported', () => {
    test('should be true where the page can show notifications', () => {
      expect(openTab().isSupported).toBe(true)
    })

    test('should be false without notifications, as Safari on iOS in a tab, and on a page without HTTPS', () => {
      expect(openTab({ isVisible: false }, { Notification: undefined }).isSupported).toBe(false)
      expect(openTab({ isVisible: false }, { isSecureContext: false }).isSupported).toBe(false)
    })
  })

  describe('#show', () => {
    test('should refuse where the page cannot show notifications', async () => {
      await expect(openTab({ isVisible: false }, { Notification: undefined }).show({ title: 'x' })).rejects.toThrow(
        UnsupportedError
      )
    })

    test.each<NotificationPermission>(['default', 'denied'])(
      'should refuse while the permission is %s',
      async (permission) => {
        FakeNotification.permission = permission

        await expect(openTab().show({ title: 'Report sent' })).rejects.toThrow(PermissionDeniedError)
      }
    )

    test('should show a notification from the page where there is no service worker', async () => {
      const shown = await openTab().show({ title: 'Report sent', body: 'It has arrived.', data: { id: 7 } })

      const [notification] = FakeNotification.instances
      expect(notification?.title).toBe('Report sent')
      expect(notification?.options).toEqual({ body: 'It has arrived.', data: { id: 7 }, tag: shown?.tag })
      expect(shown?.tag).toMatch(/\S+/)
    })

    test('should keep the tag of the application', async () => {
      const shown = await openTab().show({ title: 'Report sent', tag: 'outbox' })

      expect(shown?.tag).toBe('outbox')
      expect(FakeNotification.instances[0]?.tag).toBe('outbox')
    })

    test('should report a click, bring the page to the front and close the notification', async () => {
      const clicks: NotificationClick[] = []
      const sut = openTab()
      sut.on('click', (click) => clicks.push(click))

      await sut.show({ title: 'Report sent', tag: 'outbox', data: { id: 7 } })
      FakeNotification.instances[0]?.click()

      expect(clicks).toEqual([{ tag: 'outbox', data: { id: 7 }, action: '' }])
      expect(focus).toHaveBeenCalledOnce()
      expect(FakeNotification.instances[0]?.isClosed).toBe(true)
    })

    test('should report a notification that was closed, and close one itself', async () => {
      const closes: NotificationClose[] = []
      const sut = openTab()
      sut.on('close', (close) => closes.push(close))

      const shown = await sut.show({ title: 'Report sent', tag: 'outbox' })
      await shown?.close()

      expect(closes).toEqual([{ tag: 'outbox' }])
    })

    test('should say where only a service worker can show notifications, as Chromium on Android', async () => {
      FakeNotification.isConstructorRefused = true

      await expect(openTab().show({ title: 'Report sent' })).rejects.toThrow(UnsupportedError)
    })
  })

  describe('with a service worker', () => {
    beforeEach(() => {
      worker = new FakeServiceWorker()
    })

    test('should show the notification through the worker', async () => {
      FakeNotification.isConstructorRefused = true

      const shown = await openTab().show({ title: 'Report sent', tag: 'outbox' })

      expect(worker?.shown.map(({ title, options }) => [title, options.tag])).toEqual([['Report sent', 'outbox']])
      expect(FakeNotification.instances).toEqual([])

      await shown?.close()

      expect(worker?.shown[0]?.isClosed).toBe(true)
    })

    test.each<FakeServiceWorker['state']>(['none', 'installing', 'silent'])(
      'should show it from the page where the worker is %s',
      async (state) => {
        if (worker !== undefined) {
          worker.state = state
        }

        await openTab().show({ title: 'Report sent' })

        expect(FakeNotification.instances).toHaveLength(1)
        expect(worker?.shown).toEqual([])
      }
    )

    test('should report the clicks the worker forwards', () => {
      const clicks: NotificationClick[] = []
      const closes: NotificationClose[] = []
      const sut = openTab()
      sut.on('click', (click) => clicks.push(click))
      sut.on('close', (close) => closes.push(close))

      const message = { type: NotificationWorkerMessages.type, tag: 'outbox', data: 1, action: 'open' }
      worker?.post({ ...message, event: 'click' })
      worker?.post({ ...message, event: 'close' })
      worker?.post({ type: 'something else' })

      expect(clicks).toEqual([{ tag: 'outbox', data: 1, action: 'open' }])
      expect(closes).toEqual([{ tag: 'outbox' }])
    })

    test('should stop listening to the worker without listeners', () => {
      const sut = openTab()
      const subscription = sut.on('click', () => undefined)

      subscription.unsubscribe()

      expect(worker?.listenerCount).toBe(0)
    })
  })

  describe('when', () => {
    test.each(['hidden', 'unseen'] as const)('%s: should not show it while the user can see this tab', async (when) => {
      expect(await openTab({ isVisible: true }).show({ title: 'Report sent', when })).toBeUndefined()
      expect(FakeNotification.instances).toEqual([])
    })

    test('hidden: should show it while this tab is in the background, whatever the others', async () => {
      openTab({ isVisible: true }).isSeenElsewhere()

      expect(await openTab().show({ title: 'Report sent', when: 'hidden' })).toBeDefined()
    })

    test('unseen: should not show it while the user can see another tab of the application', async () => {
      // the other tab answers once its notifications were used
      void openTab({ isVisible: true }).isSupported

      expect(await openTab().show({ title: 'Report sent', when: 'unseen' })).toBeUndefined()
      expect(FakeNotification.instances).toEqual([])
    })

    test('unseen: should show it while no tab can be seen', async () => {
      void openTab({ isVisible: false }).isSupported

      expect(await openTab().show({ title: 'Report sent', when: 'unseen' })).toBeDefined()
    })

    test('always: should show it also while the user can see the tab', async () => {
      expect(await openTab({ isVisible: true }).show({ title: 'Report sent' })).toBeDefined()
    })
  })

  describe('#isSeenElsewhere', () => {
    test('should be true while another tab can be seen, and false when none answers', async () => {
      const other = { isVisible: true }
      void openTab(other).isSupported
      const sut = openTab()

      expect(await sut.isSeenElsewhere()).toBe(true)

      other.isVisible = false

      expect(await sut.isSeenElsewhere()).toBe(false)
    })

    test('should not count a tab that was disposed', async () => {
      const other = openTab({ isVisible: true })
      void other.isSupported
      other.dispose()

      expect(await openTab().isSeenElsewhere()).toBe(false)
    })
  })
})
