import { describe, expect, test } from 'vitest'

import { DefaultDevice } from '../core/default-device.ts'

/**
 * These specs run in real browsers. They cover what needs no permission: the browsers of the test run have no
 * location to give.
 */
describe('platform, orientation and location in a real browser', () => {
  test('should tell how the page is held', async () => {
    using device = DefaultDevice.create()

    expect(device.orientation.current).toBe(innerHeight >= innerWidth ? 'portrait' : 'landscape')
    expect(device.orientation.isPortrait).not.toBe(device.orientation.isLandscape)
  })

  test('should watch the orientation only while someone listens, without failing', async () => {
    using device = DefaultDevice.create()

    const subscription = device.orientation.on('change', () => undefined)

    expect(() => subscription.unsubscribe()).not.toThrow()
  })

  test('should not take a desktop browser for a phone', async () => {
    using device = DefaultDevice.create()

    expect(device.platform.isIos).toBe(false)
    expect(device.platform.isAndroid).toBe(false)
  })

  test('should have a location on a page that is served securely', async () => {
    using device = DefaultDevice.create()

    expect(device.location.isSupported).toBe('geolocation' in navigator)
  })
})
