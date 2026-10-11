import { describe, expect, test, vi } from 'vitest'

import { JsonCodec } from './json-codec.ts'

const encoder = new TextEncoder()

describe('json-codec', () => {
  test.each([[{ a: 1, b: ['x', null] }], ['text'], [42], [true], [null], [[]]])(
    'should encode %j as JSON and decode it again',
    async (value) => {
      const sut = new JsonCodec()

      const encoded = sut.encode(value)

      expect(encoded).toBe(JSON.stringify(value))
      expect(sut.decode(encoded)).toEqual(value)
      expect(sut.decode(encoder.encode(encoded))).toEqual(value)
    }
  )

  test.each([[undefined], [() => {}], [Symbol('symbol')]])('should refuse %s, which has no JSON', async (value) => {
    expect(() => new JsonCodec().encode(value)).toThrowError(TypeError)
  })

  test('should fail for something that is not JSON', async () => {
    expect(() => new JsonCodec().decode('not json')).toThrowError(SyntaxError)
  })

  test('should pass what it read through the validator', async () => {
    const parse = vi.fn((value: unknown) => ({ ...(value as object), validated: true }))
    const sut = new JsonCodec({ parse })

    expect(sut.decode('{"theme":"dark"}')).toEqual({ theme: 'dark', validated: true })
    expect(parse).toHaveBeenCalledExactlyOnceWith({ theme: 'dark' })
  })

  test('should fail with the error of the validator', async () => {
    const error = new Error('invalid')

    const sut = new JsonCodec({
      parse: () => {
        throw error
      },
    })

    expect(() => sut.decode('{}')).toThrowError(error)
  })
})
