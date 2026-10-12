import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { StorageSpaceReader } from './storage-space-reader.ts'

describe('storage-space-reader', () => {
  const createReader = (storage: Partial<Navigator['storage']> | undefined) =>
    new StorageSpaceReader(BrowserEnvironment.of({ navigator: { storage } as Navigator }))

  describe('#read', () => {
    test('should read the estimate and the persistence of the browser', async () => {
      const sut = createReader({
        estimate: async () => ({ quota: 1000, usage: 250 }),
        persisted: async () => true,
      })

      expect(await sut.read()).toMatchObject({ isKnown: true, quota: 1000, usage: 250, isPersistent: true })
    })

    test.each([
      ['there is no navigator', new StorageSpaceReader(BrowserEnvironment.of({}))],
      ['the browser has no storage manager', createReader(undefined)],
      ['the browser has no estimate', createReader({})],
      ['the estimate is empty', createReader({ estimate: async () => ({}) })],
      ['the estimate fails', createReader({ estimate: () => Promise.reject(new Error('refused')) })],
    ])('should be unknown if %s', async (_, sut) => {
      expect(await sut.read()).toMatchObject({ isKnown: false, isPersistent: false })
    })

    test('should still report the persistence if the estimate fails', async () => {
      const sut = createReader({ estimate: () => Promise.reject(new Error('refused')), persisted: async () => true })

      expect(await sut.read()).toMatchObject({ isKnown: false, isPersistent: true })
    })

    test('should report no persistence if it cannot be read', async () => {
      const sut = createReader({
        estimate: async () => ({ quota: 1000, usage: 250 }),
        persisted: () => Promise.reject(new Error('refused')),
      })

      expect(await sut.read()).toMatchObject({ isKnown: true, isPersistent: false })
    })
  })

  describe('#persist', () => {
    test.each([true, false])('should return %s as the browser decided', async (granted) => {
      expect(await createReader({ persist: async () => granted }).persist()).toBe(granted)
    })

    test('should return false if the browser cannot persist or fails', async () => {
      expect(await createReader({}).persist()).toBe(false)
      expect(await createReader({ persist: () => Promise.reject(new Error('refused')) }).persist()).toBe(false)
      expect(await new StorageSpaceReader(BrowserEnvironment.of({})).persist()).toBe(false)
    })
  })
})
