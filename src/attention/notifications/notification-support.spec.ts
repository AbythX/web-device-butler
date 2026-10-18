import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { FakeNotification } from '../testing/fake-notifications.ts'
import { NotificationSupport } from './notification-support.ts'

describe('notification-support', () => {
  test('should hand out the notifications on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ Notification: FakeNotification })

    expect(NotificationSupport.isSupportedIn(environment)).toBe(true)
    expect(NotificationSupport.resolveFor(environment)).toBe(FakeNotification)
  })

  test('should not be supported outside a secure context', async () => {
    const environment = BrowserEnvironment.of({ Notification: FakeNotification, isSecureContext: false })

    expect(NotificationSupport.isSupportedIn(environment)).toBe(false)
    expect(NotificationSupport.resolveFor(environment)).toBeUndefined()
  })

  test('should not be supported where the page cannot show notifications', async () => {
    expect(NotificationSupport.isSupportedIn(BrowserEnvironment.of({}))).toBe(false)
  })
})
