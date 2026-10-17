import { beforeEach, describe, expect, test, vi } from 'vitest'

import { NotificationWorkerMessages } from '../attention/notifications/notification-messages.ts'
import {
  forwardNotificationEvents,
  type NotificationEventLike,
  type NotificationWorkerScope,
  type WindowClientLike,
} from './notification-events.ts'

/** a page of the application, as the worker sees it */
const page = (state: Partial<Pick<WindowClientLike, 'focused' | 'visibilityState'>> = {}) => ({
  ...state,
  focus: vi.fn(async () => undefined),
  postMessage: vi.fn(),
})

describe('notification-events', () => {
  let pages!: ReturnType<typeof page>[]
  let openWindow!: ReturnType<typeof vi.fn<(url: string) => Promise<WindowClientLike | null>>>
  let listeners!: Map<string, (event: NotificationEventLike) => void>
  let scope!: NotificationWorkerScope

  /** the system tells the worker about its notification, and the worker finishes */
  const dispatch = async (type: 'notificationclick' | 'notificationclose', action?: string) => {
    let work: Promise<unknown> = Promise.resolve()
    const notification = { tag: 'outbox', data: { id: 7 }, close: vi.fn() }

    listeners.get(type)?.({ notification, action, waitUntil: (promise) => (work = promise) })
    await work

    return notification
  }

  beforeEach(() => {
    pages = []
    openWindow = vi.fn(async (_url: string) => null)
    listeners = new Map()
    scope = {
      clients: { matchAll: async () => pages, openWindow },
      registration: { scope: 'https://example.com/app/' },
      addEventListener: (type, listener) => listeners.set(type, listener),
    }
    forwardNotificationEvents(scope)
  })

  test('should close the notification, bring the page used last to the front and tell it', async () => {
    const background = page({ visibilityState: 'hidden' })
    const focused = page({ focused: true })
    pages = [background, focused]

    const notification = await dispatch('notificationclick', 'open')

    expect(notification.close).toHaveBeenCalledOnce()
    expect(focused.focus).toHaveBeenCalledOnce()
    expect(focused.postMessage).toHaveBeenCalledWith({
      type: NotificationWorkerMessages.type,
      event: 'click',
      tag: 'outbox',
      data: { id: 7 },
      action: 'open',
    })
    expect(background.postMessage).not.toHaveBeenCalled()
  })

  test('should take a page the user can see, then any page', async () => {
    const hidden = page({ visibilityState: 'hidden' })
    const visible = page({ visibilityState: 'visible' })
    pages = [hidden, visible]

    await dispatch('notificationclick')

    expect(visible.focus).toHaveBeenCalledOnce()
    expect(NotificationWorkerMessages.is(visible.postMessage.mock.calls[0]?.[0])).toBe(true)
  })

  test('should open a page where none is open', async () => {
    await dispatch('notificationclick')

    expect(openWindow).toHaveBeenCalledWith('https://example.com/app/')
  })

  test('should open the page the application names', async () => {
    forwardNotificationEvents(scope, { openUrl: '/reports' })

    await dispatch('notificationclick')

    expect(openWindow).toHaveBeenCalledWith('/reports')
  })

  test('should tell every page that a notification was closed', async () => {
    pages = [page(), page()]

    await dispatch('notificationclose')

    for (const open of pages) {
      expect(open.postMessage).toHaveBeenCalledWith(expect.objectContaining({ event: 'close', tag: 'outbox' }))
    }
  })
})
