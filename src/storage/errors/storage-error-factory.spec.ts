import { describe, expect, test } from 'vitest'

import { StorageAccessDeniedError } from './storage-access-denied-error.ts'
import { StorageCodecError } from './storage-codec-error.ts'
import { StorageError } from './storage-error.ts'
import { StorageErrorFactory } from './storage-error-factory.ts'
import { StorageQuotaExceededError } from './storage-quota-exceeded-error.ts'

describe('storage-error-factory', () => {
  describe('#from', () => {
    test.each(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'])(
      'should turn %s into a quota error',
      async (name) => {
        const cause = new DOMException('full', name)

        const error = StorageErrorFactory.from(cause, "Could not write 'key'")

        expect(error).toBeInstanceOf(StorageQuotaExceededError)
        expect(error.message).toContain("Could not write 'key'")
        expect(error.cause).toBe(cause)
      }
    )

    test.each(['SecurityError', 'NotAllowedError', 'InvalidAccessError'])(
      'should turn %s into an access denied error',
      async (name) => {
        const cause = new DOMException('refused', name)

        const error = StorageErrorFactory.from(cause, "Could not read 'key'")

        expect(error).toBeInstanceOf(StorageAccessDeniedError)
        expect(error.cause).toBe(cause)
      }
    )

    test.each([[new DOMException('unknown', 'UnknownError')], [new Error('plain')], ['text'], [undefined], [null]])(
      'should turn %s into a storage error with the action as message',
      async (cause) => {
        const error = StorageErrorFactory.from(cause, "Could not read 'key'")

        expect(error.constructor).toBe(StorageError)
        expect(error.message).toBe("Could not read 'key'")
        expect(error.cause).toBe(cause)
      }
    )

    test('should return a storage error as it is', async () => {
      const error = new StorageCodecError('already translated')

      expect(StorageErrorFactory.from(error, 'action')).toBe(error)
    })
  })

  describe('#isNotFound', () => {
    test('should recognise the not found error of the browser', async () => {
      expect(StorageErrorFactory.isNotFound(new DOMException('missing', 'NotFoundError'))).toBe(true)
      expect(StorageErrorFactory.isNotFound(new DOMException('other', 'SecurityError'))).toBe(false)
      expect(StorageErrorFactory.isNotFound(undefined)).toBe(false)
    })
  })
})
