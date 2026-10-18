import { describe, expect, test } from 'vitest'

import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { ScreenError } from './screen-error.ts'
import { ScreenErrorFactory } from './screen-error-factory.ts'

const browserError = (name: string) => Object.assign(new Error(`${name} of the browser`), { name })

describe('screen-error-factory', () => {
  describe('#from', () => {
    test('should turn a refusal into a denied permission where the caller names one', async () => {
      const cause = browserError('NotAllowedError')

      const error = ScreenErrorFactory.from(cause, 'Could not keep the screen on', { permission: 'screen-wake-lock' })

      expect(error).toBeInstanceOf(PermissionDeniedError)
      expect(error).toMatchObject({ permission: 'screen-wake-lock', cause })
    })

    test('should turn a call the device cannot do into an unsupported feature where the caller names one', async () => {
      const cause = browserError('NotSupportedError')

      const error = ScreenErrorFactory.from(cause, 'The browser did not keep the page in portrait', {
        feature: 'orientation lock',
      })

      expect(error).toBeInstanceOf(UnsupportedError)
      expect(error).toMatchObject({ feature: 'orientation lock', cause })
    })

    test.each(['NotAllowedError', 'NotSupportedError', 'TypeError'])(
      'should turn %s into a screen error where the caller maps nothing',
      async (name) => {
        const cause = browserError(name)

        const error = ScreenErrorFactory.from(cause, 'The browser did not fill the screen with the element')

        expect(error).toBeInstanceOf(ScreenError)
        expect(error).toMatchObject({ message: 'The browser did not fill the screen with the element', cause })
      }
    )

    test('should return an error of the library as it is', async () => {
      const error = new ScreenError('already translated')

      expect(ScreenErrorFactory.from(error, 'Could not keep the screen on')).toBe(error)
    })
  })
})
