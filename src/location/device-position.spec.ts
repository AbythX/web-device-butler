import { describe, expect, test } from 'vitest'

import { DevicePosition } from './device-position.ts'

const berlin = { latitude: 52.52, longitude: 13.405 }

const hamburg = { latitude: 53.5511, longitude: 9.9937 }

describe('device-position', () => {
  describe('#distanceTo', () => {
    test('should measure the distance along the surface of the earth', async () => {
      const position = new DevicePosition(berlin.latitude, berlin.longitude, 10, 0)

      // Berlin to Hamburg is about 255 km as the crow flies
      expect(position.distanceTo(hamburg) / 1000).toBeCloseTo(255.3, 0)
    })

    test('should be zero to the same place', async () => {
      const position = new DevicePosition(berlin.latitude, berlin.longitude, 10, 0)

      expect(position.distanceTo(position)).toBe(0)
    })

    test('should be the same in both directions', async () => {
      const first = new DevicePosition(berlin.latitude, berlin.longitude, 10, 0)
      const second = new DevicePosition(hamburg.latitude, hamburg.longitude, 10, 0)

      expect(first.distanceTo(second)).toBeCloseTo(second.distanceTo(first), 6)
    })
  })
})
