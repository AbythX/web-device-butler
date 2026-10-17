import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultDeviceButler } from '../core/default-device-butler.ts'
import type { DeviceButler } from '../core/device-butler.ts'
import { DeviceButlerError } from '../core/errors/device-butler-error.ts'
import { PermissionDeniedError } from '../permission/errors/permission-denied-error.ts'

/**
 * These specs run in real browsers. The browsers of the specs do not grant notifications and have nothing to
 * vibrate with, so the specs ask for what holds everywhere: what the library says a browser can do is what it then
 * does, a refusal arrives as an error of the library, and the tabs find each other.
 */
const hasNotifications = typeof Notification === 'function' && globalThis.isSecureContext

describe('notifications and vibration in a real browser', () => {
  let butler!: DeviceButler

  beforeEach(async () => {
    await commands.showFirstTab()
    butler = DefaultDeviceButler.create()
  })

  afterEach(async () => {
    await butler.dispose()
  })

  test('should say whether the page can show notifications', () => {
    expect(butler.notifications.isSupported).toBe(hasNotifications)
  })

  test('should tell the state of the permission as the browser has it', async () => {
    const state = await butler.permission.query('notifications')

    const expected = hasNotifications
      ? { granted: 'granted', denied: 'denied', default: 'prompt' }[Notification.permission]
      : 'unsupported'

    expect(state).toBe(expected)
  })

  test('should show a notification where it is granted, and refuse with an error of the library elsewhere', async () => {
    const outcome = await butler.notifications.show({ title: 'Spec', tag: 'spec' }).catch((error: unknown) => error)
    const isGranted = hasNotifications && Notification.permission === 'granted'

    expect(outcome instanceof DeviceButlerError).toBe(!isGranted)
    expect(outcome instanceof PermissionDeniedError).toBe(hasNotifications && !isGranted)

    await (outcome as { close?: () => Promise<void> } | undefined)?.close?.()
  })

  test('should find out whether another tab of the application can be seen', async () => {
    expect(await butler.notifications.isSeenElsewhere()).toBe(false)

    const isVisible = await commands.answerNotificationsInSecondTab()

    expect(await butler.notifications.isSeenElsewhere()).toBe(isVisible)

    await commands.showFirstTab()

    // a headless browser can leave every tab visible, whichever is in front
    expect(await butler.notifications.isSeenElsewhere()).toBe(await commands.isSecondTabVisible())

    await commands.closeSecondTab()
  })

  test('should vibrate where the browser can, and say so where it cannot', () => {
    const canVibrate = typeof navigator.vibrate === 'function'

    expect(butler.vibration.isSupported).toBe(canVibrate)
    expect(typeof butler.vibration.vibrate('tap')).toBe('boolean')
    expect(() => butler.vibration.stop()).not.toThrow()
  })
})
