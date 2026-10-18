import { describe, expect, test } from 'vitest'

import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { SharingError } from './sharing-error.ts'
import { SharingErrorFactory } from './sharing-error-factory.ts'

const browserError = (name: string) => Object.assign(new Error(`${name} of the browser`), { name })

describe('sharing-error-factory', () => {
  describe('#from', () => {
    test('should turn a refusal into a denied permission', async () => {
      const cause = browserError('NotAllowedError')

      const error = SharingErrorFactory.from(cause, 'clipboard', 'The browser could not copy the text')

      expect(error).toBeInstanceOf(PermissionDeniedError)
      expect(error).toMatchObject({ permission: 'clipboard', cause })
    })

    test('should turn every other failure into a sharing error with the message', async () => {
      const cause = browserError('DataError')

      const error = SharingErrorFactory.from(cause, 'share', 'The browser could not share this')

      expect(error).toBeInstanceOf(SharingError)
      expect(error).toMatchObject({ message: 'The browser could not share this', cause })
    })

    test('should return an error of the library as it is', async () => {
      const error = new SharingError('already translated')

      expect(SharingErrorFactory.from(error, 'share', 'The browser could not share this')).toBe(error)
    })
  })

  describe('#isCancellation', () => {
    test('should recognize a share sheet the user closed', async () => {
      expect(SharingErrorFactory.isCancellation(browserError('AbortError'))).toBe(true)
      expect(SharingErrorFactory.isCancellation(browserError('NotAllowedError'))).toBe(false)
    })
  })
})
