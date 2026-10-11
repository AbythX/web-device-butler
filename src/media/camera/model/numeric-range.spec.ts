import { describe, expect, test } from 'vitest'

import { NumericRange } from './numeric-range.ts'

describe('numeric-range', () => {
  describe('.from', () => {
    test('should read a range the browser reports', async () => {
      const sut = NumericRange.from({ min: 1, max: 8, step: 0.1 })

      expect(sut).toEqual(new NumericRange(1, 8, 0.1))
      expect(sut?.span).toBe(7)
    })

    test('should work without a step', async () => {
      expect(NumericRange.from({ min: 1, max: 8 })?.step).toBeUndefined()
    })

    test.each([
      ['nothing', undefined],
      ['null', null],
      ['a number', 4],
      ['a range without a maximum', { min: 1 }],
      ['a range without room', { min: 1, max: 1 }],
      ['a range that is upside down', { min: 4, max: 1 }],
      ['a range of strings', { min: '1', max: '8' }],
    ])('should give nothing for %s', async (_name, value) => {
      expect(NumericRange.from(value)).toBeUndefined()
    })
  })

  describe('#clamp', () => {
    test.each([
      [0.5, 1],
      [3, 3],
      [20, 8],
    ])('should move %d to %d', async (value, expected) => {
      expect(new NumericRange(1, 8).clamp(value)).toBe(expected)
    })
  })

  describe('#contains', () => {
    test('should include both ends', async () => {
      const sut = new NumericRange(1, 8)

      expect([1, 8, 0.9, 8.1].map((value) => sut.contains(value))).toEqual([true, true, false, false])
    })
  })

  describe('#toJSON', () => {
    test('should survive a round trip', async () => {
      const sut = new NumericRange(1, 8, 0.5)

      expect(NumericRange.from(JSON.parse(JSON.stringify(sut)))).toEqual(sut)
    })
  })
})
