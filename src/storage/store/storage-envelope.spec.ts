import { describe, expect, test } from 'vitest'

import { StorageCodecError } from '../errors/storage-codec-error.ts'
import { StorageVersionError } from '../errors/storage-version-error.ts'
import { StorageEnvelope } from './storage-envelope.ts'

const encoder = new TextEncoder()

const decoder = new TextDecoder()

describe('storage-envelope', () => {
  describe('#seal', () => {
    test('should seal a string as a header line followed by the string', async () => {
      expect(StorageEnvelope.seal('value', undefined, false)).toBe('{"v":1,"t":"s"}\nvalue')
      expect(StorageEnvelope.seal('value', 1234, true)).toBe('{"v":1,"t":"s","e":1234}\nvalue')
    })

    test('should seal bytes as base64 for a backend of strings', async () => {
      const sealed = StorageEnvelope.seal(new Uint8Array([0, 255, 10]), 1234, false)

      expect(sealed).toBe('{"v":1,"t":"b","e":1234}\nAP8K')
    })

    test('should seal bytes as bytes for a binary backend', async () => {
      const sealed = StorageEnvelope.seal(new Uint8Array([0, 255, 10]), undefined, true) as Uint8Array

      expect(sealed).toBeInstanceOf(Uint8Array)
      expect(decoder.decode(sealed.subarray(0, -3))).toBe('{"v":1,"t":"b"}\n')
      expect(sealed.subarray(-3)).toEqual(new Uint8Array([0, 255, 10]))
    })

    test('should keep the header below the length that is read as the head of an entry', async () => {
      const header = StorageEnvelope.headerBytes(Number.MAX_SAFE_INTEGER)

      expect(header.byteLength).toBeLessThan(StorageEnvelope.maxHeaderLength)
      expect(decoder.decode(header).endsWith('\n')).toBe(true)
    })
  })

  describe('#open', () => {
    test.each([
      ['a string', 'line one\nline two 🎥'],
      ['an empty string', ''],
      ['bytes', new Uint8Array([0, 10, 13, 255])],
      ['no bytes', new Uint8Array(0)],
    ])('should return %s that was sealed for any backend', async (_, payload) => {
      for (const binary of [true, false]) {
        expect(StorageEnvelope.open('key', StorageEnvelope.seal(payload, undefined, binary)).payload).toEqual(payload)
      }
    })

    test('should return a string that a backend of bytes returned as bytes', async () => {
      const sealed = encoder.encode(StorageEnvelope.seal('value 🎥', undefined, true) as string)

      expect(StorageEnvelope.open('key', sealed).payload).toBe('value 🎥')
    })

    test('should tell where the value starts', async () => {
      const sealed = StorageEnvelope.seal(new Uint8Array([7, 8, 9]), undefined, true) as Uint8Array

      expect(sealed.subarray(StorageEnvelope.open('key', sealed).payloadOffset)).toEqual(new Uint8Array([7, 8, 9]))
    })

    test('should open the head of an entry without its value', async () => {
      const sealed = StorageEnvelope.seal('x'.repeat(10_000), 1234, false) as string

      const envelope = StorageEnvelope.open('key', sealed.slice(0, StorageEnvelope.maxHeaderLength))

      expect(envelope.expiresAt).toBe(1234)
    })

    test('should tell whether the entry has expired', async () => {
      const expiring = StorageEnvelope.open('key', StorageEnvelope.seal('value', 1000, false))
      const lasting = StorageEnvelope.open('key', StorageEnvelope.seal('value', undefined, false))

      expect(expiring.isExpired(999)).toBe(false)
      expect(expiring.isExpired(1000)).toBe(true)
      expect(lasting.expiresAt).toBeUndefined()
      expect(lasting.isExpired(Number.MAX_SAFE_INTEGER)).toBe(false)
    })

    test('should ignore header fields it does not know', async () => {
      expect(StorageEnvelope.open('key', '{"v":1,"t":"s","future":true}\nvalue').payload).toBe('value')
    })

    test('should refuse an entry in a newer format', async () => {
      const open = () => StorageEnvelope.open('settings', '{"v":2,"t":"s"}\nvalue')

      expect(open).toThrowError(StorageVersionError)
      expect(open).toThrowError(expect.objectContaining({ key: 'settings', found: 2, supported: 1 }))
    })

    test.each([
      'no header',
      '',
      '\n',
      'not json\nvalue',
      '"text"\nvalue',
      'null\nvalue',
      '{}\nvalue',
      '{"v":1}\nvalue',
      '{"t":"s"}\nvalue',
      '{"v":"1","t":"s"}\nvalue',
      '{"v":1,"t":"x"}\nvalue',
      '{"v":1,"t":"s","e":"soon"}\nvalue',
      `${' '.repeat(StorageEnvelope.maxHeaderLength)}{"v":1,"t":"s"}\nvalue`,
    ])('should refuse the foreign entry %j as a string and as bytes', async (foreign) => {
      expect(() => StorageEnvelope.open('key', foreign)).toThrowError(StorageCodecError)
      expect(() => StorageEnvelope.open('key', encoder.encode(foreign))).toThrowError(StorageCodecError)
    })
  })
})
