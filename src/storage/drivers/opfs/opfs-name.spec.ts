import { describe, expect, test } from 'vitest'

import { StorageError } from '../../errors/storage-error.ts'
import { OpfsName } from './opfs-name.ts'

describe('opfs-name', () => {
  test.each([
    ['', '_'],
    ['settings', '_settings'],
    ['with-dash_and_underscore-123', '_with-dash_and_underscore-123'],
    ['Upper', '_%55pper'],
    ['a/b', '_a%2fb'],
    ['a.b', '_a%2eb'],
    ['..', '_%2e%2e'],
    ['%41', '_%2541'],
    ['ü', '_%c3%bc'],
    ['🎥', '_%f0%9f%8e%a5'],
  ])('should encode %j as %j and decode it again', async (text, name) => {
    expect(OpfsName.encode(text)).toBe(name)
    expect(OpfsName.decode(name)).toBe(text)
  })

  test('should refuse a name that is too long for the file system once it is escaped', async () => {
    expect(OpfsName.encode('a'.repeat(254))).toHaveLength(255)
    expect(() => OpfsName.encode('a'.repeat(255))).toThrowError(StorageError)
    expect(() => OpfsName.encode('A'.repeat(85))).toThrowError(/256 characters/)
  })

  test.each(['', 'settings', '_Upper', '_a.b', '_key.crswap', '_%4', '_%zz', '_%4A', '.', '_a/b'])(
    'should not decode %j, which it did not encode',
    async (name) => {
      expect(OpfsName.decode(name)).toBeUndefined()
    }
  )
})
