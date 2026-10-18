import { describe, expect, test } from 'vitest'

import { BrowserError } from './browser-error.ts'

describe('browser-error', () => {
  describe('nameOf', () => {
    test('should read the name of a DOMException and of an Error', async () => {
      expect(BrowserError.nameOf(new DOMException('refused', 'NotAllowedError'))).toBe('NotAllowedError')
      expect(BrowserError.nameOf(new TypeError('broken'))).toBe('TypeError')
    })

    test('should read the name of an object that is not an error', async () => {
      expect(BrowserError.nameOf({ name: 'AbortError' })).toBe('AbortError')
    })

    test.each([
      ['a name that is not a string', { name: 42 }],
      ['an object without a name', {}],
      ['null', null],
      ['undefined', undefined],
      ['a string', 'NotAllowedError'],
    ])('should return an empty name for %s', async (_case, error) => {
      expect(BrowserError.nameOf(error)).toBe('')
    })
  })

  describe('codeOf', () => {
    test('should read a numeric code', async () => {
      expect(BrowserError.codeOf({ code: 1, message: 'User denied Geolocation' })).toBe(1)
    })

    test.each([
      ['a code that is not a number', { code: '1' }],
      ['an object without a code', {}],
      ['null', null],
      ['a number', 1],
    ])('should return no code for %s', async (_case, error) => {
      expect(BrowserError.codeOf(error)).toBeUndefined()
    })
  })

  describe('hasName', () => {
    test('should tell whether the error has one of the names', async () => {
      const error = new DOMException('busy', 'NotReadableError')

      expect(BrowserError.hasName(error, 'NotReadableError')).toBe(true)
      expect(BrowserError.hasName(error, 'AbortError', 'NotReadableError')).toBe(true)
      expect(BrowserError.hasName(error, 'AbortError')).toBe(false)
    })

    test('should not match something without a name', async () => {
      expect(BrowserError.hasName(undefined, 'NotAllowedError')).toBe(false)
      expect(BrowserError.hasName({ name: 42 }, 'NotAllowedError')).toBe(false)
    })
  })

  describe('isRefusal', () => {
    test('should recognize a refusal', async () => {
      expect(BrowserError.isRefusal(new DOMException('refused', 'NotAllowedError'))).toBe(true)
    })

    test('should not take anything else for a refusal', async () => {
      expect(BrowserError.isRefusal(new DOMException('closed', 'AbortError'))).toBe(false)
      expect(BrowserError.isRefusal(undefined)).toBe(false)
    })
  })

  describe('isCancellation', () => {
    test('should recognize a dialog the user closed', async () => {
      expect(BrowserError.isCancellation(new DOMException('closed', 'AbortError'))).toBe(true)
    })

    test('should not take anything else for a cancellation', async () => {
      expect(BrowserError.isCancellation(new DOMException('refused', 'NotAllowedError'))).toBe(false)
      expect(BrowserError.isCancellation(undefined)).toBe(false)
    })
  })
})
