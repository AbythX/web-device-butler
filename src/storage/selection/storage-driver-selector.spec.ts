import { describe, expect, test } from 'vitest'

import { StorageCapabilities, type StoragePersistence } from '../storage-capabilities.ts'
import { StorageDriverSelector, type StorageDriverCandidate } from './storage-driver-selector.ts'

const candidate = (
  name: string,
  persistence: StoragePersistence,
  binary: boolean,
  streaming: boolean,
  consistentAcrossTabs = true
): StorageDriverCandidate => ({
  name,
  capabilities: new StorageCapabilities({ driver: name, persistence, binary, streaming, consistentAcrossTabs }),
})

const local = candidate('local', 'origin', false, false, false)

const session = candidate('session', 'tab', false, false)

const memory = candidate('memory', 'page', true, true)

const opfs = candidate('opfs', 'origin', true, true)

const indexedDb = candidate('indexeddb', 'origin', true, false)

/** the backends of the library, in the order in which a storage manager registers them */
const builtIn = [local, session, memory, opfs, indexedDb]

const names = (candidates: readonly StorageDriverCandidate[]) => candidates.map(({ name }) => name)

describe('storage-driver-selector', () => {
  const sut = new StorageDriverSelector()

  describe('without a list of drivers', () => {
    test('should take the backend whose data lives longest, in the order of the library', async () => {
      expect(names(sut.select(builtIn, {}).ranked)).toEqual(['indexeddb', 'opfs', 'local', 'session', 'memory'])
    })

    test('should put a custom backend after the ones of the library with the same lifetime', async () => {
      const candidates = [candidate('custom', 'origin', true, true), ...builtIn]

      expect(names(sut.select(candidates, {}).ranked).slice(0, 4)).toEqual(['indexeddb', 'opfs', 'local', 'custom'])
    })

    test('should never use a backend that lacks what is required', async () => {
      const shared = { consistentAcrossTabs: true, crossTabEvents: true }

      expect(names(sut.select(builtIn, { require: { streaming: true } }).ranked)).toEqual(['opfs', 'memory'])
      expect(names(sut.select(builtIn, { require: { persistence: 'tab' } }).ranked)).toEqual(['session'])
      expect(names(sut.select(builtIn, { require: shared }).ranked)).toEqual(['indexeddb', 'opfs'])
    })

    test('should take a required lifetime exactly', async () => {
      expect(names(sut.select(builtIn, { require: { persistence: 'page' } }).ranked)).toEqual(['memory'])
    })

    test('should rank the backends with what is preferred higher', async () => {
      const selection = sut.select(builtIn, { require: { persistence: 'origin' }, prefer: { streaming: true } })

      expect(names(selection.ranked)).toEqual(['opfs', 'indexeddb', 'local'])
    })

    test('should count every preferred trait', async () => {
      const selection = sut.select(builtIn, { prefer: { streaming: true, persistence: 'origin', binary: true } })

      expect(names(selection.ranked)).toEqual(['opfs', 'indexeddb', 'memory', 'local', 'session'])
    })

    test('should ask for nothing with a trait that is false', async () => {
      expect(sut.select(builtIn, { require: { streaming: false, binary: false } }).ranked).toHaveLength(5)
    })

    test('should only protect what is kept with the origin against eviction', async () => {
      const selection = sut.select(builtIn, { require: { persistent: true } })

      expect(names(selection.ranked)).toEqual(['indexeddb', 'opfs', 'local'])
    })
  })

  describe('with a list of drivers', () => {
    const chain = [memory, local, indexedDb]

    test('should keep the order of the list', async () => {
      expect(names(sut.select(chain, { driver: names(chain) }).ranked)).toEqual(['memory', 'local', 'indexeddb'])
    })

    test('should rank by what is preferred first, then by the order of the list', async () => {
      const selection = sut.select(chain, { driver: names(chain), prefer: { persistence: 'origin' } })

      expect(names(selection.ranked)).toEqual(['local', 'indexeddb', 'memory'])
    })

    test('should remove the backends of the list that lack what is required', async () => {
      const selection = sut.select(chain, { driver: names(chain), require: { binary: true, persistence: 'origin' } })

      expect(names(selection.ranked)).toEqual(['indexeddb'])
    })
  })

  describe('the selection', () => {
    test('should say which requirement removed which backend', async () => {
      const selection = sut.select([local, session], { require: { persistence: 'origin', binary: true } })

      expect(selection.best).toBeUndefined()
      expect(selection.explain()).toBe(
        "None of the 2 storage drivers fits the requirements: 'local' lacks binary values; " +
          "'session' lacks persistence 'origin', binary values"
      )
    })

    test('should say that there is nothing to choose from', async () => {
      expect(sut.select([], {}).explain()).toBe('There is no storage driver to choose from')
    })

    test('should move a backend that does not work in this browser to the rejected ones', async () => {
      const selection = sut.select(builtIn, { require: { streaming: true } })

      const remaining = selection.without(opfs)

      expect(names(remaining.ranked)).toEqual(['memory'])
      expect(remaining.explain()).toContain("'opfs' lacks support in this browser")
    })
  })
})
