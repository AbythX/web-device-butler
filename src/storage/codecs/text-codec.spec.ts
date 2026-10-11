import { describe, expect, test } from 'vitest'

import { TextCodec } from './text-codec.ts'

const encoder = new TextEncoder()

describe('text-codec', () => {
  test('should keep a string as it is', async () => {
    const sut = new TextCodec()

    expect(sut.encode('value 🎥')).toBe('value 🎥')
    expect(sut.decode('value 🎥')).toBe('value 🎥')
    expect(sut.decode(encoder.encode('value 🎥'))).toBe('value 🎥')
  })

  test('should refuse what is not a string', async () => {
    expect(() => new TextCodec().encode(42 as unknown as string)).toThrowError(TypeError)
  })
})
