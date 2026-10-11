import { describe, expect, test } from 'vitest'

import { LocationError } from './location-error.ts'
import { LocationErrorFactory } from './location-error-factory.ts'
import { LocationTimeoutError } from './location-timeout-error.ts'

describe('location-error-factory', () => {
  test('should keep an error of the library as it is', async () => {
    const error = new LocationTimeoutError()

    expect(LocationErrorFactory.from(error)).toBe(error)
  })

  test('should wrap what it does not know', async () => {
    const error = LocationErrorFactory.from('broken')

    expect(error).toBeInstanceOf(LocationError)
    expect(error.name).toBe('LocationError')
    expect(error.cause).toBe('broken')
  })
})
