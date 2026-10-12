import { describe, expect, test } from 'vitest'

import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { StorageSpace } from '../space/storage-space.ts'
import { StorageAccessDeniedError } from './storage-access-denied-error.ts'
import { StorageCodecError } from './storage-codec-error.ts'
import { StorageError } from './storage-error.ts'
import { StorageLockedError } from './storage-locked-error.ts'
import { StorageQuotaExceededError } from './storage-quota-exceeded-error.ts'
import { StorageUnsupportedError } from './storage-unsupported-error.ts'
import { StorageVersionError } from './storage-version-error.ts'

describe('storage-error', () => {
  const cause = new Error('original')

  test.each([
    ['StorageError', new StorageError('message', { cause })],
    ['StorageUnsupportedError', new StorageUnsupportedError('message', { cause })],
    ['StorageQuotaExceededError', new StorageQuotaExceededError('message', undefined, { cause })],
    ['StorageCodecError', new StorageCodecError('message', { cause })],
    ['StorageAccessDeniedError', new StorageAccessDeniedError('message', { cause })],
    ['StorageLockedError', new StorageLockedError('key', { cause })],
  ])('should name %s after its class and keep the cause', async (name, error) => {
    expect(error).toBeInstanceOf(StorageError)
    expect(error).toBeInstanceOf(DeviceButlerError)
    expect(error.name).toBe(name)
    expect(error.cause).toBe(cause)
  })

  test('should carry the space on a quota error', async () => {
    const space = new StorageSpace(1000, 990, false)

    expect(new StorageQuotaExceededError('message', space).space).toBe(space)
    expect(new StorageQuotaExceededError('message').space).toBeUndefined()
  })

  test('should carry the key on a locked error', async () => {
    const error = new StorageLockedError('recording-1')

    expect(error.key).toBe('recording-1')
    expect(error.message).toContain('recording-1')
  })

  test('should carry the key and the versions on a version error', async () => {
    const error = new StorageVersionError('settings', 3, 1)

    expect(error).toBeInstanceOf(StorageError)
    expect(error).toMatchObject({ name: 'StorageVersionError', key: 'settings', found: 3, supported: 1 })
  })
})
