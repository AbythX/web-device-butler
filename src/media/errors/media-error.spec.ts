import { describe, expect, test } from 'vitest'

import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceBusyError } from './media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from './media-device-not-found-error.ts'
import { MediaError } from './media-error.ts'
import { MediaRequirementsError } from './media-requirements-error.ts'
import { SessionClosedError } from './session-closed-error.ts'

describe('media-error', () => {
  test.each([
    ['MediaError', new MediaError('failed')],
    ['MediaDeviceBusyError', new MediaDeviceBusyError('camera', 'other-tab')],
    ['MediaDeviceNotFoundError', new MediaDeviceNotFoundError('missing')],
    ['MediaRequirementsError', new MediaRequirementsError('no match')],
    ['SessionClosedError', new SessionClosedError()],
  ])('should make %s a media error with its own name', async (name, error) => {
    expect(error).toBeInstanceOf(MediaError)
    expect(error).toBeInstanceOf(DeviceButlerError)
    expect(error.name).toBe(name)
  })

  test('should keep a denied permission out of the media errors, other areas refuse permissions too', async () => {
    const error = new PermissionDeniedError('camera')

    expect(error).toBeInstanceOf(DeviceButlerError)
    expect(error).not.toBeInstanceOf(MediaError)
    expect(error.name).toBe('PermissionDeniedError')
    expect(error.permission).toBe('camera')
  })

  test.each([
    ['this-tab', 'The camera is already in use in this tab'],
    ['other-tab', 'The camera is in use in another tab'],
    ['unknown', 'The camera is in use or could not be started'],
  ] as const)('should say who holds the device: %s', async (holder, message) => {
    const error = new MediaDeviceBusyError('camera', holder)

    expect(error.holder).toBe(holder)
    expect(error.kind).toBe('camera')
    expect(error.message).toBe(message)
  })
})
