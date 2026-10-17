import { beforeEach, describe, expect, test } from 'vitest'

import { FakeNotification } from '../../attention/testing/fake-notifications.ts'
import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { NotificationPermissionRequester } from './notification-permission-requester.ts'

describe('notification-permission-requester', () => {
  let sut!: NotificationPermissionRequester

  beforeEach(() => {
    FakeNotification.reset()
    FakeNotification.permission = 'default'
    sut = new NotificationPermissionRequester(BrowserEnvironment.of({ Notification: FakeNotification }))
  })

  test('should be supported where the page can show notifications, on a page over HTTPS', () => {
    expect(sut.isSupported).toBe(true)
    expect(new NotificationPermissionRequester(BrowserEnvironment.of({})).isSupported).toBe(false)
    expect(
      new NotificationPermissionRequester(
        BrowserEnvironment.of({ Notification: FakeNotification, isSecureContext: false })
      ).isSupported
    ).toBe(false)
  })

  test.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    // the user closed the prompt, or the browser did not ask outside a click
    ['default', 'prompt'],
  ] as const)('should report the answer %s as %s', async (answer, state) => {
    FakeNotification.answer = answer

    expect(await sut.request()).toBe(state)
    expect(await sut.query()).toBe(state)
  })

  test('should tell the state without asking', async () => {
    expect(await sut.query()).toBe('prompt')
  })
})
