import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { DefaultDeviceNotifications } from '../../../attention/notifications/default-device-notifications.ts'
import type { NotificationMessages } from '../../../attention/notifications/notification-messages.ts'
import { FakeNotification } from '../../../attention/testing/fake-notifications.ts'
import { CrossTabChannel } from '../../../core/coordination/channel/cross-tab-channel.ts'
import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import type { PageLifecycle } from '../../../platform/page/page-lifecycle.ts'
import { renderHook } from '../testing/render-hook.ts'
import { useNotifications } from './use-notifications.ts'

/**
 * The hook runs against fake notifications: the browsers of the specs do not grant the permission.
 */
describe('useNotifications', () => {
  let channel!: CrossTabChannel<NotificationMessages>
  let notifications!: DefaultDeviceNotifications

  beforeEach(() => {
    FakeNotification.reset()

    const environment = BrowserEnvironment.of({
      window: { focus: () => undefined } as unknown as Window,
      Notification: FakeNotification,
    })

    channel = new CrossTabChannel('use-notifications', environment, new NullLogger())
    notifications = new DefaultDeviceNotifications(
      environment,
      channel,
      { isVisible: false } as PageLifecycle,
      new NullLogger()
    )
  })

  afterEach(() => {
    notifications.dispose()
    channel.close()
  })

  test('should show a notification and follow its click', async () => {
    const hook = await renderHook(() => useNotifications(notifications))

    await hook.act(async () => {
      await hook.result.current.show({ title: 'Report sent', tag: 'outbox' })
      FakeNotification.instances[0]?.click()
    })

    expect(hook.result.current.click?.tag).toBe('outbox')

    await hook.unmount()
  })

  test('should put a failure into the state instead of throwing', async () => {
    FakeNotification.permission = 'denied'
    const hook = await renderHook(() => useNotifications(notifications))

    await hook.act(async () => {
      await hook.result.current.show({ title: 'Report sent' })
    })

    expect((hook.result.current.error as Error).name).toBe('PermissionDeniedError')

    await hook.unmount()
  })
})
