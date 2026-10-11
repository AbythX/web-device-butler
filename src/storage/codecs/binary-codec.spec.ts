import { describe, expect, test } from 'vitest'

import { BinaryCodec } from './binary-codec.ts'

const encoder = new TextEncoder()

describe('binary-codec', () => {
  test('should keep bytes as they are', async () => {
    const sut = new BinaryCodec()
    const bytes = new Uint8Array([0, 128, 255])

    expect(sut.encode(bytes)).toBe(bytes)
    expect(sut.decode(bytes)).toBe(bytes)
  })

  test('should return the bytes of an entry that was written as a string', async () => {
    expect(new BinaryCodec().decode('value')).toEqual(encoder.encode('value'))
  })

  test('should refuse what is not a Uint8Array', async () => {
    expect(() => new BinaryCodec().encode('text' as unknown as Uint8Array)).toThrowError(TypeError)
    expect(() => new BinaryCodec().encode(new ArrayBuffer(2) as unknown as Uint8Array)).toThrowError(TypeError)
  })

  describe('behind a header', () => {
    test('should decode a part of a buffer into bytes with a buffer of their own', async () => {
      const stored = new Uint8Array([9, 9, 1, 2, 3])

      const decoded = new BinaryCodec().decode(stored.subarray(2))

      expect(decoded).toEqual(new Uint8Array([1, 2, 3]))
      expect(decoded.byteOffset).toBe(0)
      expect(decoded.buffer.byteLength).toBe(3)
    })

    test('should not copy bytes that fill their buffer', async () => {
      const stored = new Uint8Array([1, 2, 3])

      expect(new BinaryCodec().decode(stored)).toBe(stored)
    })
  })
})
