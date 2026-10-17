import { describe, expect, test } from 'vitest'

import type { MotionReadingLike, OrientationReadingLike } from '../../core/environment/sensor-events-like.ts'
import { MotionGeometry } from './motion-geometry.ts'

const reading = (values: Partial<OrientationReadingLike>): OrientationReadingLike => ({
  alpha: 0,
  beta: 0,
  gamma: 0,
  absolute: false,
  ...values,
})

const attitude = (values: Partial<OrientationReadingLike>, screenAngle = 0) => {
  const result = MotionGeometry.attitude(reading(values), screenAngle)

  if (result === undefined) {
    throw new Error('No attitude')
  }

  return result
}

describe('motion-geometry', () => {
  describe('#attitude', () => {
    test('should be level for a device that lies flat', () => {
      const { pitch, roll } = attitude({})

      expect(pitch).toBeCloseTo(0)
      expect(roll).toBeCloseTo(0)
    })

    test.each([30, 60, 90, -20])('should take beta %s as the pitch of a device held the natural way', (beta) => {
      expect(attitude({ beta }).pitch).toBeCloseTo(beta)
      expect(attitude({ beta }).roll).toBeCloseTo(0)
    })

    test.each([30, -45])('should take gamma %s as the roll of a device held the natural way', (gamma) => {
      expect(attitude({ gamma }).roll).toBeCloseTo(gamma)
      expect(attitude({ gamma }).pitch).toBeCloseTo(0)
    })

    test.each([
      // the top edge of the screen is the edge of the device that is raised
      [90, { gamma: -30 }],
      [180, { beta: -30 }],
      [270, { gamma: 30 }],
    ])('should give the pitch of the screen as it is held, turned by %s degrees', (screenAngle, values) => {
      const { pitch, roll } = attitude(values, screenAngle)

      expect(pitch).toBeCloseTo(30)
      expect(roll).toBeCloseTo(0)
    })

    test('should give the tilt of the right edge, which is less than gamma while the device is pitched', () => {
      const tilt = (Math.asin(Math.cos(Math.PI / 4) * Math.sin(Math.PI / 6)) * 180) / Math.PI

      // the pitch turns around the left-to-right axis of the screen, so it follows the screen past upright
      const pitch = (Math.atan2(Math.SQRT1_2, Math.SQRT1_2 * Math.cos(Math.PI / 6)) * 180) / Math.PI

      expect(attitude({ beta: 45, gamma: 30 }).roll).toBeCloseTo(tilt)
      expect(attitude({ beta: 45, gamma: 30 }).pitch).toBeCloseTo(pitch)
    })

    test('should give the roll of the screen as it is held sideways', () => {
      // held sideways with its top to the left, the right edge of the screen is the bottom of the device: it goes
      // down when the top of the device goes up
      expect(attitude({ beta: 20 }, 90).roll).toBeCloseTo(20)
    })

    test('should be undefined for a reading without angles, as a desktop sends', () => {
      expect(MotionGeometry.attitude(reading({ alpha: null, beta: null, gamma: null }), 0)).toBeUndefined()
    })

    test('should keep what the browser reported', () => {
      expect(attitude({ alpha: 10, beta: 20, gamma: 30, absolute: true }).raw).toEqual({
        alpha: 10,
        beta: 20,
        gamma: 30,
        absolute: true,
      })
    })
  })

  describe('the heading', () => {
    test('should have none where alpha is not measured from north', () => {
      expect(attitude({ alpha: 90 }).heading).toBeUndefined()
    })

    test.each([
      [0, 0],
      [90, 270],
      [270, 90],
    ])('should point where the top edge of a flat device points, for alpha %s', (alpha, heading) => {
      expect(attitude({ alpha, absolute: true }).heading).toBeCloseTo(heading)
    })

    test('should point where the top edge of the screen points, also when it is held sideways', () => {
      // the top of the device points west, so the right edge of the device, the top of the screen, points north
      expect(attitude({ alpha: 90, absolute: true }, 90).heading).toBeCloseTo(0)
    })

    test('should point where the back of a device points that is held upright', () => {
      expect(attitude({ alpha: 90, beta: 90, absolute: true }).heading).toBeCloseTo(270)
      expect(attitude({ alpha: 0, beta: 80, absolute: true }).heading).toBeCloseTo(0)
    })

    test('should take the compass of Safari, for the screen as it is held', () => {
      expect(attitude({ webkitCompassHeading: 10 }).heading).toBeCloseTo(10)
      expect(attitude({ webkitCompassHeading: 300 }, 90).heading).toBeCloseTo(30)
    })

    test('should have none where Safari does not trust its compass', () => {
      expect(attitude({ webkitCompassHeading: 10, webkitCompassAccuracy: -1 }).heading).toBeUndefined()
    })
  })

  describe('#movement', () => {
    const motion = (values: Partial<MotionReadingLike>): MotionReadingLike => ({
      acceleration: null,
      accelerationIncludingGravity: null,
      rotationRate: null,
      interval: 16,
      ...values,
    })

    test('should give the values along the axes of the screen as it is held', () => {
      const movement = MotionGeometry.movement(
        motion({
          accelerationIncludingGravity: { x: 9.8, y: 0, z: 0 },
          rotationRate: { alpha: 1, beta: 2, gamma: 3 },
        }),
        90
      )

      // the right edge of the device is the top of the screen
      expect(movement?.accelerationIncludingGravity?.x).toBeCloseTo(0)
      expect(movement?.accelerationIncludingGravity?.y).toBeCloseTo(9.8)
      expect(movement?.rotationRate?.x).toBeCloseTo(-3)
      expect(movement?.rotationRate?.y).toBeCloseTo(2)
      expect(movement?.rotationRate?.z).toBeCloseTo(1)
      expect(movement?.acceleration).toBeUndefined()
      expect(movement?.interval).toBe(16)
    })

    test('should be undefined for a reading without values', () => {
      expect(MotionGeometry.movement(motion({}), 0)).toBeUndefined()
    })
  })
})
