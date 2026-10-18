import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment, type BrowserGlobals } from '../core/environment/browser-environment.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import type { Logger } from '../core/logging/logger.ts'
import { FakeEventTarget } from '../core/testing/fake-event-target.ts'
import { DefaultDeviceMotion } from './default-device-motion.ts'
import type { DeviceMotion } from './device-motion.ts'
import type { Attitude, Movement } from './model/attitude.ts'

const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const turned = (alpha: number, beta: number, gamma: number, absolute = false) => ({ alpha, beta, gamma, absolute })

/** the window of a phone, which can be held sideways */
class FakeWindow extends FakeEventTarget {
  public readonly screen = { orientation: { angle: 0 } }
}

describe('default-device-motion', () => {
  let window!: FakeWindow
  let globals!: Partial<BrowserGlobals>
  let sut!: DeviceMotion

  const motionOf = (overrides: Partial<BrowserGlobals> = {}) =>
    new DefaultDeviceMotion(BrowserEnvironment.of({ ...globals, ...overrides }), mock<Logger>(), {
      unavailableAfter: 20,
    })

  beforeEach(() => {
    window = new FakeWindow()
    globals = {
      window: window as unknown as Window,
      document: {} as Document,
      DeviceOrientationEvent: { prototype: {} },
      DeviceMotionEvent: { prototype: {} },
    }
    sut = motionOf()
  })

  afterEach(() => {
    sut.dispose()
  })

  describe('#isSupported', () => {
    test('should be true where the browser reports how the device is turned or moves', () => {
      expect(sut.isSupported).toBe(true)
    })

    test('should be false without the events, on a page without HTTPS and without a page', () => {
      expect(motionOf({ DeviceOrientationEvent: undefined, DeviceMotionEvent: undefined }).isSupported).toBe(false)
      expect(motionOf({ isSecureContext: false }).isSupported).toBe(false)
      expect(new DefaultDeviceMotion(BrowserEnvironment.of({}), mock<Logger>()).isSupported).toBe(false)
    })

    test('should refuse to watch what the browser does not report', () => {
      const without = motionOf({ DeviceOrientationEvent: undefined, DeviceMotionEvent: undefined })

      expect(() => without.watchAttitude()).toThrow(UnsupportedError)
      expect(() => without.watchMotion()).toThrow(UnsupportedError)
    })
  })

  describe('#watchAttitude', () => {
    test('should report how the device is turned', () => {
      const changes: Attitude[] = []
      using watch = sut.watchAttitude()
      watch.on('change', (attitude) => changes.push(attitude))

      window.dispatch('deviceorientation', turned(0, 45, 0))

      expect(changes).toHaveLength(1)
      expect(changes[0]?.pitch).toBeCloseTo(45)
      expect(watch.current).toBe(changes[0])
      expect(watch.isAvailable).toBe(true)
      expect(watch.isActive).toBe(true)
    })

    test('should give the values for the screen as it is held', () => {
      using watch = sut.watchAttitude()
      window.screen.orientation.angle = 90

      window.dispatch('deviceorientation', turned(0, 0, -30))

      expect(watch.current?.pitch).toBeCloseTo(30)
    })

    test('should take the events that measure from north once one has arrived, for the heading', () => {
      using watch = sut.watchAttitude()

      window.dispatch('deviceorientationabsolute', turned(90, 0, 0, true))
      window.dispatch('deviceorientation', turned(10, 0, 0))

      expect(watch.current?.heading).toBeCloseTo(270)
      expect(watch.current?.raw.alpha).toBe(90)
    })

    test('should say at once that a device sends no values, as a desktop does', () => {
      let unavailable = 0
      using watch = sut.watchAttitude()
      watch.on('unavailable', () => unavailable++)

      window.dispatch('deviceorientation', { alpha: null, beta: null, gamma: null })

      expect(watch.isAvailable).toBe(false)
      expect(unavailable).toBe(1)
    })

    test('should say that a device is unavailable that sends nothing, as Safari before the permission', async () => {
      let unavailable = 0
      using watch = sut.watchAttitude()
      watch.on('unavailable', () => unavailable++)

      await pause(40)

      expect(watch.isAvailable).toBe(false)
      expect(unavailable).toBe(1)

      window.dispatch('deviceorientation', turned(0, 10, 0))

      expect(watch.isAvailable).toBe(true)
      expect(watch.current?.pitch).toBeCloseTo(10)
    })

    test('should report no more than the rate allows, and the last value after it', async () => {
      const pitches: number[] = []
      using watch = sut.watchAttitude({ rate: 20 })
      watch.on('change', ({ pitch }) => pitches.push(Math.round(pitch)))

      for (const beta of [10, 20, 30, 40]) {
        window.dispatch('deviceorientation', turned(0, beta, 0))
      }

      expect(pitches).toEqual([10])

      await pause(80)

      expect(pitches).toEqual([10, 40])
    })

    test('should stop listening when it is stopped', () => {
      const watch = sut.watchAttitude()

      watch.stop()
      watch.stop()

      expect(watch.isActive).toBe(false)
      expect(window.listenerCount()).toBe(0)
    })
  })

  describe('#watchMotion', () => {
    test('should report how the device moves, along the axes of the screen', () => {
      const changes: Movement[] = []
      using watch = sut.watchMotion()
      watch.on('change', (movement) => changes.push(movement))

      window.dispatch('devicemotion', {
        acceleration: { x: 1, y: 2, z: 3 },
        accelerationIncludingGravity: { x: 1, y: 2, z: 12.8 },
        rotationRate: { alpha: 0, beta: 5, gamma: 0 },
        interval: 16,
      })

      expect(changes[0]?.acceleration).toEqual({ x: 1, y: 2, z: 3 })
      expect(changes[0]?.rotationRate?.x).toBeCloseTo(5)
    })

    test('should say that a device without sensors sends nothing', () => {
      using watch = sut.watchMotion()

      window.dispatch('devicemotion', {
        acceleration: null,
        accelerationIncludingGravity: null,
        rotationRate: null,
        interval: 0,
      })

      expect(watch.isAvailable).toBe(false)
    })
  })

  describe('#dispose', () => {
    test('should stop every watch', () => {
      const attitude = sut.watchAttitude()
      const motion = sut.watchMotion()

      sut.dispose()

      expect([attitude.isActive, motion.isActive]).toEqual([false, false])
      expect(window.listenerCount()).toBe(0)
    })
  })
})
