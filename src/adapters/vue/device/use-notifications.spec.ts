import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { DefaultDeviceNotifications } from '../../../attention/notifications/default-device-notifications.ts'
import type { NotificationMessages } from '../../../attention/notifications/notification-messages.ts'
import { FakeNotification } from '../../../attention/testing/fake-notifications.ts'
import { CrossTabChannel } from '../../../core/coordination/channel/cross-tab-channel.ts'
import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import type { PageLifecycle } from '../../../platform/page/page-lifecycle.ts'
import { useNotifications } from './use-notifications.ts'

describe('use-notifications', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope
  let channel!: CrossTabChannel<NotificationMessages>
  let notifications!: DefaultDeviceNotifications

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    FakeNotification.reset()
    scope = effectScope()

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
    scope.stop()
    notifications.dispose()
    channel.close()
  })

  test('should show a notification and follow its click', async () => {
    const sut = within(() => useNotifications(notifications))

    const shown = await sut.show({ title: 'Report sent', tag: 'outbox' })
    FakeNotification.instances[0]?.click()

    expect(shown?.tag).toBe('outbox')
    expect(sut.click.value?.tag).toBe('outbox')
  })

  test('should put a failure into the state instead of throwing', async () => {
    FakeNotification.permission = 'denied'
    const sut = within(() => useNotifications(notifications))

    expect(await sut.show({ title: 'Report sent' })).toBeUndefined()
    expect((sut.error.value as Error).name).toBe('PermissionDeniedError')
  })

  test('should stop listening when the component is unmounted', async () => {
    const sut = within(() => useNotifications(notifications))
    await sut.show({ title: 'Report sent', tag: 'outbox' })

    scope.stop()
    FakeNotification.instances[0]?.click()

    expect(sut.click.value).toBeUndefined()
  })
})
