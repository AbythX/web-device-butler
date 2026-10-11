import { describe, expect, test } from 'vitest'

import { Base64 } from './base64.ts'

describe('base64', () => {
  test.each([
    [[], ''],
    [[0], 'AA=='],
    [[255, 254], '//4='],
    [[1, 2, 3], 'AQID'],
    [[104, 101, 108, 108, 111], 'aGVsbG8='],
  ])('should encode the bytes %j as %j and decode them again', async (values, text) => {
    const bytes = new Uint8Array(values)

    expect(Base64.encode(bytes)).toBe(text)
    expect(Base64.decode(text)).toEqual(bytes)
  })

  test('should encode and decode more bytes than fit into one call of the runtime', async () => {
    const bytes = Uint8Array.from({ length: 300_000 }, (_, index) => (index * 7) % 256)

    expect(Base64.encode(bytes)).toHaveLength(400_000)
    expect(Base64.decode(Base64.encode(bytes))).toEqual(bytes)
  })

  test('should encode a view of a larger buffer', async () => {
    const bytes = new Uint8Array([9, 9, 1, 2, 3, 9]).subarray(2, 5)

    expect(Base64.decode(Base64.encode(bytes))).toEqual(new Uint8Array([1, 2, 3]))
  })
})
