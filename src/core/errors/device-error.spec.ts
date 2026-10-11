import { describe, expect, test } from 'vitest'

import { DeviceError } from './device-error.ts'

class TestError extends DeviceError {
  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
  }
}

describe('device-error', () => {
  test('should be an error with the given message', async () => {
    const sut = new TestError('something failed')

    expect(sut).toBeInstanceOf(Error)
    expect(sut).toBeInstanceOf(DeviceError)
    expect(sut.message).toBe('something failed')
  })

  test('should be named after its class', async () => {
    expect(new TestError().name).toBe('TestError')
  })

  test('should keep the original error as cause', async () => {
    const cause = new Error('original')

    expect(new TestError('something failed', { cause }).cause).toBe(cause)
  })
})
