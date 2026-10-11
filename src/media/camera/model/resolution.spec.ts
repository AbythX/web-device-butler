import { describe, expect, test } from 'vitest'

import { Resolution } from './resolution.ts'

describe('resolution', () => {
  describe('.from', () => {
    test('should read a resolution', async () => {
      expect(Resolution.from({ width: 1920, height: 1080 })).toEqual(new Resolution(1920, 1080))
    })

    test.each([
      ['nothing', undefined],
      ['a missing height', { width: 1920 }],
      ['a width of zero', { width: 0, height: 1080 }],
      ['strings', { width: '1920', height: '1080' }],
    ])('should give nothing for %s', async (_name, value) => {
      expect(Resolution.from(value)).toBeUndefined()
    })
  })

  describe('#covers', () => {
    test('should cover a smaller and an equal resolution', async () => {
      const sut = new Resolution(1920, 1080)

      expect(sut.covers({ width: 1280, height: 720 })).toBe(true)
      expect(sut.covers({ width: 1920, height: 1080 })).toBe(true)
    })

    test('should not cover a resolution that is larger on one side', async () => {
      expect(new Resolution(1920, 1080).covers({ width: 1920, height: 1200 })).toBe(false)
    })

    test('should not care which way the device is held', async () => {
      expect(new Resolution(1080, 1920).covers({ width: 1920, height: 1080 })).toBe(true)
      expect(new Resolution(1920, 1080).covers({ width: 1080, height: 1920 })).toBe(true)
    })
  })

  describe('#pixels', () => {
    test('should multiply the sides', async () => {
      expect(new Resolution(1920, 1080).pixels).toBe(2_073_600)
    })
  })

  describe('#toString', () => {
    test('should read like a resolution', async () => {
      expect(`${new Resolution(1920, 1080)}`).toBe('1920x1080')
    })
  })

  describe('.common', () => {
    test('should list the largest first', async () => {
      const pixels = Resolution.common.map((resolution) => resolution.pixels)

      expect(pixels).toEqual([...pixels].sort((first, second) => second - first))
    })
  })
})
