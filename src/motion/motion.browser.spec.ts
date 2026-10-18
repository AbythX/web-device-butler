import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { DefaultDeviceButler } from '../core/default-device-butler.ts'
import type { DeviceButler } from '../core/device-butler.ts'

/**
 * These specs run in real browsers, which have no sensors on the machines of the specs. They dispatch the events of
 * the browser itself, as a device would, and check what the library makes of them, and that the permission can be
 * asked about everywhere.
 */
const hasOrientationEvents = typeof DeviceOrientationEvent === 'function'

/** the WebKit build of Playwright has the events, and refuses to create them */
const canCreate = (create: () => Event) => {
  try {
    return create() instanceof Event
  } catch {
    return false
  }
}

const canCreateOrientationEvents = canCreate(() => new DeviceOrientationEvent('deviceorientation'))

const canCreateMotionEvents = canCreate(() => new DeviceMotionEvent('devicemotion', { interval: 16 }))

describe('the sensors in a real browser', () => {
  let butler!: DeviceButler

  beforeEach(() => {
    butler = DefaultDeviceButler.create()
  })

  afterEach(async () => {
    await butler.dispose()
  })

  test('should say it is supported where the browser has the events', () => {
    expect(butler.motion.isSupported).toBe(hasOrientationEvents || typeof DeviceMotionEvent === 'function')
  })

  test('should tell the state of the permission without asking, in every browser', async () => {
    const state = await butler.permission.query('motion')

    expect(['granted', 'prompt', 'denied', 'unknown', 'unsupported']).toContain(state)
    expect(state === 'unsupported').toBe(!butler.motion.isSupported)
  })

  test.skipIf(!canCreateOrientationEvents)('should read the events the browser dispatches', () => {
    using watch = butler.motion.watchAttitude()

    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: -10 }))

    // gamma is an angle of the browser, applied after beta; the right edge of the screen is tilted less than that
    const tilt = (Math.asin(Math.cos((40 * Math.PI) / 180) * Math.sin((-10 * Math.PI) / 180)) * 180) / Math.PI

    expect(watch.current?.pitch).toBeCloseTo(40, 0)
    expect(watch.current?.roll).toBeCloseTo(tilt, 1)
    expect(watch.current?.heading).toBeUndefined()
  })

  test.skipIf(!canCreateOrientationEvents)('should take the heading from an event that measures from north', () => {
    using watch = butler.motion.watchAttitude()

    window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 90, beta: 0, gamma: 0, absolute: true })
    )

    expect(watch.current?.heading).toBeCloseTo(270, 0)
  })

  test.skipIf(!canCreateMotionEvents)('should read the motion the browser dispatches', () => {
    using watch = butler.motion.watchMotion()

    window.dispatchEvent(
      new DeviceMotionEvent('devicemotion', {
        accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 },
        rotationRate: { alpha: 0, beta: 0, gamma: 0 },
        interval: 16,
      })
    )

    expect(watch.current?.accelerationIncludingGravity?.z).toBeCloseTo(9.8)
    expect(watch.current?.interval).toBe(16)
  })
})
