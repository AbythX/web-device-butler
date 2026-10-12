import { describe, expect, test } from 'vitest'

import { DevicePosition } from './device-position.ts'
import { LocationRequirementsError } from './errors/location-requirements-error.ts'
import { PositionSearch } from './position-search.ts'

const within = (accuracy: number, altitude?: number) => new DevicePosition(52.52, 13.405, accuracy, 0, altitude)

describe('position-search', () => {
  describe('#offer', () => {
    test('should go on after a position without what is required', async () => {
      const sut = new PositionSearch({ accuracy: 50 }, {}, false)

      expect(sut.offer(within(400))).toBeUndefined()
    })

    test('should end with the first position that has what is required if it is not patient', async () => {
      const sut = new PositionSearch({ accuracy: 50 }, { accuracy: 5 }, false)
      const position = within(40)

      expect(sut.offer(position)).toBe(position)
    })

    test('should go on for what is preferred if it is patient', async () => {
      const sut = new PositionSearch({ accuracy: 50 }, { accuracy: 5 }, true)
      const precise = within(4)

      expect(sut.offer(within(40))).toBeUndefined()
      expect(sut.offer(precise)).toBe(precise)
    })
  })

  describe('#conclude', () => {
    test('should give the most accurate position that has what is required', async () => {
      const sut = new PositionSearch({ accuracy: 50 }, { accuracy: 5 }, true)
      const best = within(20)

      sut.offer(within(40))
      sut.offer(best)
      sut.offer(within(30))
      sut.offer(within(900))

      expect(sut.conclude()).toBe(best)
    })

    test('should take the position with more of what is preferred over a more accurate one', async () => {
      const sut = new PositionSearch({ accuracy: 50 }, { altitude: true, accuracy: 5 }, true)
      const high = within(40, 34)

      sut.offer(within(10))
      sut.offer(high)

      expect(sut.conclude()).toBe(high)
    })

    test('should fail with the best position it saw if none had what is required', async () => {
      const sut = new PositionSearch({ accuracy: 50 }, {}, true)
      const best = within(300)

      sut.offer(within(800))
      sut.offer(best)

      const failure = (() => {
        try {
          return sut.conclude()
        } catch (error) {
          return error
        }
      })()

      expect(failure).toBeInstanceOf(LocationRequirementsError)
      expect(failure).toMatchObject({
        message: 'The best position of the device lacks accuracy of 50 m',
        position: best,
      })
    })

    test('should fail without a position if none arrived', async () => {
      const sut = new PositionSearch({ accuracy: 50 }, {}, true)

      expect(() => sut.conclude()).toThrow('The device did not determine a position in time')
    })
  })
})
