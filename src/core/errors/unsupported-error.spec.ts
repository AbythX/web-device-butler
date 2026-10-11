import { describe, expect, test } from 'vitest'

import { DeviceError } from './device-error.ts'
import { UnsupportedError } from './unsupported-error.ts'

describe('unsupported-error', () => {
  test('should be a device error that names the missing feature', async () => {
    const cause = new Error('original')
    const sut = new UnsupportedError('navigator.locks', { cause })

    expect(sut).toBeInstanceOf(DeviceError)
    expect(sut.name).toBe('UnsupportedError')
    expect(sut.feature).toBe('navigator.locks')
    expect(sut.message).toContain('navigator.locks')
    expect(sut.cause).toBe(cause)
  })
})
