import { describe, expect, test } from 'vitest'

import { StorageSpace } from './storage-space.ts'

describe('storage-space', () => {
  test('should derive the available space and the used ratio', async () => {
    const sut = new StorageSpace(1000, 250, true)

    expect(sut).toMatchObject({
      isKnown: true,
      quota: 1000,
      usage: 250,
      available: 750,
      usedRatio: 0.25,
      isPersistent: true,
    })
  })

  test('should never report a negative available space or a ratio above one', async () => {
    const sut = new StorageSpace(1000, 1200, false)

    expect(sut.available).toBe(0)
    expect(sut.usedRatio).toBe(1)
  })

  test('should count a quota of zero as fully used', async () => {
    const sut = new StorageSpace(0, 0, false)

    expect(sut.available).toBe(0)
    expect(sut.usedRatio).toBe(1)
    expect(sut.hasRoomFor(1)).toBe(false)
  })

  test.each([
    [undefined, undefined],
    [1000, undefined],
    [undefined, 250],
  ])('should be unknown for the quota %s and the usage %s', async (quota, usage) => {
    const sut = new StorageSpace(quota, usage, true)

    expect(sut).toMatchObject({ isKnown: false, isPersistent: true })
    expect(sut.quota).toBeUndefined()
    expect(sut.usage).toBeUndefined()
    expect(sut.available).toBeUndefined()
    expect(sut.usedRatio).toBeUndefined()
  })

  test('should create an unknown space', async () => {
    expect(StorageSpace.unknown().isKnown).toBe(false)
    expect(StorageSpace.unknown().isPersistent).toBe(false)
    expect(StorageSpace.unknown(true).isPersistent).toBe(true)
  })

  test('should be immutable', async () => {
    expect(Object.isFrozen(new StorageSpace(1000, 250, false))).toBe(true)
  })

  describe('#hasRoomFor', () => {
    test('should compare with the available space', async () => {
      const sut = new StorageSpace(1000, 250, false)

      expect(sut.hasRoomFor(0)).toBe(true)
      expect(sut.hasRoomFor(750)).toBe(true)
      expect(sut.hasRoomFor(751)).toBe(false)
    })

    test('should fail safe if the space is unknown', async () => {
      expect(StorageSpace.unknown().hasRoomFor(0)).toBe(false)
    })
  })

  describe('#equals', () => {
    test('should compare quota, usage and persistence', async () => {
      const sut = new StorageSpace(1000, 250, false)

      expect(sut.equals(new StorageSpace(1000, 250, false))).toBe(true)
      expect(sut.equals(new StorageSpace(1001, 250, false))).toBe(false)
      expect(sut.equals(new StorageSpace(1000, 251, false))).toBe(false)
      expect(sut.equals(new StorageSpace(1000, 250, true))).toBe(false)
      expect(StorageSpace.unknown().equals(StorageSpace.unknown())).toBe(true)
    })
  })
})
