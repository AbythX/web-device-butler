import { describe, expect, test } from 'vitest'

import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceBusyError } from './media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from './media-device-not-found-error.ts'
import { MediaError } from './media-error.ts'
import { MediaErrorFactory } from './media-error-factory.ts'
import { MediaRequirementsError } from './media-requirements-error.ts'
import { SessionClosedError } from './session-closed-error.ts'

const browserError = (name: string, properties: object = {}) =>
  Object.assign(new Error(`${name} of the browser`), { name, ...properties })

describe('media-error-factory', () => {
  describe('#from', () => {
    test.each([
      ['NotAllowedError', PermissionDeniedError],
      ['SecurityError', PermissionDeniedError],
      ['NotFoundError', MediaDeviceNotFoundError],
      ['NotReadableError', MediaDeviceBusyError],
      ['AbortError', MediaDeviceBusyError],
      ['OverconstrainedError', MediaRequirementsError],
      ['InvalidStateError', MediaError],
    ])('should map %s', async (name, expected) => {
      const cause = browserError(name)

      const error = MediaErrorFactory.from(cause, 'Could not open the camera', 'camera')

      expect(error).toBeInstanceOf(expected)
      expect(error.cause).toBe(cause)
    })

    test('should name the permission that was denied', async () => {
      const error = MediaErrorFactory.from(browserError('NotAllowedError'), 'Could not open', 'microphone')

      expect((error as PermissionDeniedError).permission).toBe('microphone')
    })

    test('should not know who holds a device the browser reports as busy', async () => {
      const error = MediaErrorFactory.from(browserError('NotReadableError'), 'Could not open', 'camera')

      expect((error as MediaDeviceBusyError).holder).toBe('unknown')
    })

    test('should name the constraint the browser could not satisfy', async () => {
      const cause = browserError('OverconstrainedError', { constraint: 'width' })

      const error = MediaErrorFactory.from(cause, 'Could not open the camera', 'camera') as MediaRequirementsError

      expect(error.constraint).toBe('width')
      expect(error.message).toBe("Could not open the camera: 'width' cannot be satisfied")
    })

    test('should cope with a browser that names no constraint', async () => {
      const cause = browserError('OverconstrainedError', { constraint: '' })

      const error = MediaErrorFactory.from(cause, 'Could not open the camera', 'camera') as MediaRequirementsError

      expect(error.constraint).toBeUndefined()
      expect(error.message).toBe('Could not open the camera: a requirement cannot be satisfied')
    })

    test('should use the action as the message of an error it does not know', async () => {
      const error = MediaErrorFactory.from('something', 'Could not open the camera', 'camera')

      expect(error).toBeInstanceOf(MediaError)
      expect(error.message).toBe('Could not open the camera')
      expect(error.cause).toBe('something')
    })

    test('should pass an error of the library through', async () => {
      const error = new SessionClosedError()

      expect(MediaErrorFactory.from(error, 'Could not open the camera', 'camera')).toBe(error)
    })
  })

  describe('#fromScreenCapture', () => {
    const action = 'Could not capture the screen'

    test.each(['InvalidStateError', 'InvalidAccessError'])(
      'should explain that %s means the call came without a click',
      async (name) => {
        const cause = browserError(name)

        const error = MediaErrorFactory.fromScreenCapture(cause, action, undefined)

        expect(error).toBeInstanceOf(MediaError)
        expect(error.message).toBe(`${action}: open() has to be called in answer to a click or a key of the user`)
        expect(error.cause).toBe(cause)
      }
    )

    test('should take a refusal without a click for the missing click', async () => {
      const error = MediaErrorFactory.fromScreenCapture(browserError('NotAllowedError'), action, false)

      expect(error).not.toBeInstanceOf(PermissionDeniedError)
      expect(error.message).toContain('in answer to a click')
    })

    test.each([true, undefined])(
      'should take a refusal after a click (%s) for a denied capture',
      async (wasActivated) => {
        const error = MediaErrorFactory.fromScreenCapture(browserError('NotAllowedError'), action, wasActivated)

        expect(error).toBeInstanceOf(PermissionDeniedError)
        expect((error as PermissionDeniedError).permission).toBe('display-capture')
      }
    )
  })

  describe('#fromAudioOutput', () => {
    const action = 'Could not send the sound to the audio output'

    test('should name the output that does not exist', async () => {
      const cause = browserError('NotFoundError')

      const error = MediaErrorFactory.fromAudioOutput(cause, action, 'speakers')

      expect(error).toBeInstanceOf(MediaDeviceNotFoundError)
      expect(error.message).toBe("There is no audio output with the id 'speakers'")
      expect(error.cause).toBe(cause)
    })

    test('should turn a refusal into a denied choice of the speaker', async () => {
      const error = MediaErrorFactory.fromAudioOutput(browserError('NotAllowedError'), action, 'speakers')

      expect(error).toBeInstanceOf(PermissionDeniedError)
      expect((error as PermissionDeniedError).permission).toBe('speaker-selection')
    })

    test('should use the action as the message of every other failure', async () => {
      const error = MediaErrorFactory.fromAudioOutput(browserError('AbortError'), action, 'speakers')

      expect(error).toBeInstanceOf(MediaError)
      expect(error.message).toBe(action)
    })

    test('should pass an error of the library through', async () => {
      const error = new SessionClosedError()

      expect(MediaErrorFactory.fromAudioOutput(error, action, 'speakers')).toBe(error)
    })
  })

  describe('#isOutputChoiceCancelled', () => {
    test('should take the refusal of the list of the outputs for a list the user closed', async () => {
      expect(MediaErrorFactory.isOutputChoiceCancelled(browserError('NotAllowedError'))).toBe(true)
      expect(MediaErrorFactory.isOutputChoiceCancelled(browserError('AbortError'))).toBe(false)
    })
  })

  describe('#isOverconstrained', () => {
    test('should tell an unsatisfied constraint from other errors', async () => {
      expect(MediaErrorFactory.isOverconstrained(browserError('OverconstrainedError'))).toBe(true)
      expect(MediaErrorFactory.isOverconstrained(browserError('NotAllowedError'))).toBe(false)
      expect(MediaErrorFactory.isOverconstrained(undefined)).toBe(false)
    })
  })
})
