import { describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { DefaultDeviceNotifications } from '../../attention/notifications/default-device-notifications.ts'
import type { NotificationMessages } from '../../attention/notifications/notification-messages.ts'
import { FakeNotification } from '../../attention/testing/fake-notifications.ts'
import type { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import { BrowserEnvironment, type BrowserGlobals } from '../../core/environment/browser-environment.ts'
import type { SensorEventFactory } from '../../core/environment/sensor-events-like.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { DefaultDeviceLocation } from '../../location/default-device-location.ts'
import { DefaultDeviceMotion } from '../../motion/default-device-motion.ts'
import type { PageLifecycle } from '../../platform/page/page-lifecycle.ts'
import { GeolocationPermissionRequester } from './geolocation-permission-requester.ts'
import { MotionPermissionRequester } from './motion-permission-requester.ts'
import { NotificationPermissionRequester } from './notification-permission-requester.ts'
import type { PermissionRequester } from './permission-requester.ts'

/**
 * A part and the request of its permission must say the same about whether the browser supports it, otherwise an
 * application is offered a permission for something it cannot use, or the other way round.
 */
describe('requester-support', () => {
  const page: Partial<BrowserGlobals> = { window: {} as Window, document: {} as Document }
  const sensor: SensorEventFactory = { prototype: {} }

  /** every combination the support of a part depends on */
  const environmentsWith = (api: Partial<BrowserGlobals>) =>
    [{ ...page, ...api }, { ...page, ...api, isSecureContext: false }, { ...page }, { ...api }].map((globals) =>
      BrowserEnvironment.of(globals)
    )

  const parts: [
    string,
    Partial<BrowserGlobals>,
    (environment: BrowserEnvironment) => [{ isSupported: boolean }, PermissionRequester],
  ][] = [
    [
      'location',
      { navigator: { geolocation: {} } as Navigator },
      (environment) => [
        new DefaultDeviceLocation(environment, new NullLogger()),
        new GeolocationPermissionRequester(environment),
      ],
    ],
    [
      'notifications',
      { Notification: FakeNotification },
      (environment) => [
        new DefaultDeviceNotifications(
          environment,
          mock<CrossTabChannel<NotificationMessages>>(),
          mock<PageLifecycle>(),
          new NullLogger()
        ),
        new NotificationPermissionRequester(environment),
      ],
    ],
    [
      'motion',
      { DeviceOrientationEvent: sensor, DeviceMotionEvent: sensor },
      (environment) => [
        new DefaultDeviceMotion(environment, new NullLogger()),
        new MotionPermissionRequester(environment),
      ],
    ],
  ]

  test.each(parts)('should say the same for the %s and its permission', async (_, api, create) => {
    for (const environment of environmentsWith(api)) {
      const [part, requester] = create(environment)

      expect(requester.isSupported).toBe(part.isSupported)
    }
  })

  test.each(parts)('should support the %s somewhere, so the agreement is not only on false', async (_, api, create) => {
    const [part, requester] = create(BrowserEnvironment.of({ ...page, ...api }))

    expect(part.isSupported).toBe(true)
    expect(requester.isSupported).toBe(true)
  })
})
