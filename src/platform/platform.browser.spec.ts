import { describe, expect, test } from 'vitest'

import { DefaultDeviceButler } from '../core/default-device-butler.ts'

/**
 * These specs run in real browsers. They cover what needs no permission: the browsers of the test run have no
 * location to give.
 */
describe('platform, orientation and location in a real browser', () => {
  test('should tell how the page is held', async () => {
    using butler = DefaultDeviceButler.create()

    expect(butler.orientation.current).toBe(innerHeight >= innerWidth ? 'portrait' : 'landscape')
    expect(butler.orientation.isPortrait).not.toBe(butler.orientation.isLandscape)
  })

  test('should watch the orientation only while someone listens, without failing', async () => {
    using butler = DefaultDeviceButler.create()

    const subscription = butler.orientation.on('change', () => undefined)

    expect(() => subscription.unsubscribe()).not.toThrow()
  })

  test('should not take a desktop browser for a phone', async () => {
    using butler = DefaultDeviceButler.create()

    expect(butler.platform.isIos).toBe(false)
    expect(butler.platform.isAndroid).toBe(false)
  })

  test('should have a location on a page that is served securely', async () => {
    using butler = DefaultDeviceButler.create()

    expect(butler.location.isSupported).toBe('geolocation' in navigator)
  })
})
