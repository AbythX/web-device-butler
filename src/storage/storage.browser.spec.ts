import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { BinaryCodec } from './codecs/binary-codec.ts'
import { IndexedDbStorageDriver } from './drivers/indexed-db/indexed-db-storage-driver.ts'
import { OpfsStorageDriver } from './drivers/opfs/opfs-storage-driver.ts'
import { LocalStorageDriver } from './drivers/web/local-storage-driver.ts'
import { SessionStorageDriver } from './drivers/web/session-storage-driver.ts'
import { StorageLockedError } from './errors/storage-locked-error.ts'
import { DefaultStorageManager } from './default-storage-manager.ts'
import type { StorageManager } from './storage-manager.ts'
import type { StoreChange } from './store/store-change.ts'
import { StorageDriverContract } from './testing/storage-driver-contract.ts'

/**
 * These specs run in real browsers, against the real storage APIs, Web Locks and BroadcastChannel.
 */
const environment = BrowserEnvironment.browser()

const encoder = new TextEncoder()

const decoder = new TextDecoder()

// the WebKit build that the specs run in has no working file system, a real Safari has to be checked by hand
const hasFileSystem = await new OpfsStorageDriver(environment).isSupported()

const sharedDrivers = ['local', 'indexeddb', ...(hasFileSystem ? ['opfs'] : [])]

const waitFor = async (condition: () => boolean | Promise<boolean>) => {
  for (let attempt = 0; attempt < 200 && !(await condition()); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('the drivers in a real browser', () => {
  describe('local', () => {
    StorageDriverContract.run(() => {
      localStorage.clear()

      return new LocalStorageDriver(environment)
    })
  })

  describe('session', () => {
    StorageDriverContract.run(() => {
      sessionStorage.clear()

      return new SessionStorageDriver(environment)
    })
  })

  describe.skipIf(!hasFileSystem)('opfs', () => {
    StorageDriverContract.run(() => new OpfsStorageDriver(environment, `spec-${crypto.randomUUID()}`))
  })

  describe('indexeddb', () => {
    StorageDriverContract.run(() => new IndexedDbStorageDriver(environment, `spec-${crypto.randomUUID()}`))
  })
})

describe('the storage in a real browser', () => {
  let sut!: StorageManager
  let namespace!: string

  beforeEach(() => {
    sut = DefaultStorageManager.create()
    namespace = `spec-${crypto.randomUUID()}`
  })

  afterEach(async () => {
    sut.dispose()
    await commands.closeSecondTab()
  })

  test('should coordinate across tabs', async () => {
    expect(navigator.locks).toBeDefined()
  })

  test.each(['local', 'session', 'indexeddb', 'memory'])('should support the %s driver', async (driver) => {
    expect(await sut.isSupported(driver)).toBe(true)
  })

  test('should fall back to the database where the file system is not supported', async () => {
    const store = await sut.open({ driver: ['opfs', 'indexeddb'], namespace })

    expect(await sut.isSupported('opfs')).toBe(hasFileSystem)
    expect(store.capabilities.driver).toBe(hasFileSystem ? 'opfs' : 'indexeddb')
  })

  test('should choose a backend that is kept with the origin if none is named', async () => {
    const store = await sut.open({ namespace })
    await store.set('key', 'value')

    expect(store.capabilities.driver).toBe('indexeddb')
    expect(await store.get('key')).toBe('value')
  })

  test('should choose the backend by what is required and preferred', async () => {
    const files = await sut.open({
      namespace,
      require: { persistence: 'origin', binary: true },
      prefer: { streaming: true },
    })

    const tab = await sut.open({ namespace, require: { persistence: 'tab' } })

    expect(files.capabilities.driver).toBe(hasFileSystem ? 'opfs' : 'indexeddb')
    expect(tab.capabilities.driver).toBe('session')
  })

  test('should say which backend the stores would be kept in, without opening one', async () => {
    const result = await sut.prepare({ require: { persistence: 'origin' }, prefer: { streaming: true } })

    expect(result.capabilities?.driver).toBe(hasFileSystem ? 'opfs' : 'indexeddb')
    expect(result.error).toBeUndefined()
  })

  test('should report the space of the origin', async () => {
    const space = await sut.space()

    expect(space.isKnown).toBe(true)
    expect(space.quota).toBeGreaterThan(0)
    expect(space.hasRoomFor(1024)).toBe(true)
  })

  test.skipIf(!hasFileSystem)('should write a recording as a stream to the file system and read it back', async () => {
    const store = await sut.open({ driver: 'opfs', namespace, codec: new BinaryCodec() })
    const chunk = new Uint8Array(256 * 1024).fill(7)

    const writer = (await store.writeStream('recording')).getWriter()

    for (let index = 0; index < 8; index++) {
      await writer.write(chunk)
    }

    await writer.close()

    const stream = await store.readStream('recording')
    expect((await new Response(stream).arrayBuffer()).byteLength).toBe(8 * chunk.byteLength)
    expect(await store.size()).toBeGreaterThanOrEqual(8 * chunk.byteLength)
    await store.clear()
    expect(await store.size()).toBe(0)
  })

  // every driver whose data is shared by the tabs of the origin
  describe.each(sharedDrivers)('two tabs on the %s driver', (driver) => {
    test('should see what the other tab wrote', async () => {
      const store = await sut.open({ driver, namespace })

      await commands.setInSecondTab({ driver, namespace, key: 'key', value: { from: 'second tab' } })

      if (!store.capabilities.consistentAcrossTabs) {
        // Firefox and WebKit pass a write to localStorage on to the other tabs with a delay
        await waitFor(async () => (await store.get('key')) !== undefined)
      }

      expect(await store.get('key')).toEqual({ from: 'second tab' })
    })

    test('should not lose an update if the updates of both tabs overlap', async () => {
      const store = await sut.open<number>({ driver, namespace })

      const increment = async (current: number | undefined) => {
        await new Promise((resolve) => setTimeout(resolve, 1))

        return (current ?? 0) + 1
      }

      await Promise.all([
        commands.incrementInSecondTab({ driver, namespace, key: 'count', times: 20 }),
        ...Array.from({ length: 20 }, () => store.update('count', increment)),
      ])

      // Firefox and WebKit pass a write to localStorage on to the other tabs with a delay, so an update can be lost
      // there: the store delays, it does not guarantee. Both tabs counted if there are more than 20.
      const lowest = store.capabilities.consistentAcrossTabs ? 40 : 21
      const count = (await store.get('count')) ?? 0

      expect(count).toBeGreaterThanOrEqual(lowest)
      expect(count).toBeLessThanOrEqual(40)
    })

    test('should report the write of the other tab as a remote change', async () => {
      const store = await sut.open({ driver, namespace })
      const changes: StoreChange[] = []
      store.on('change', (change) => changes.push(change))

      await commands.setInSecondTab({ driver, namespace, key: 'key', value: 1 })
      await waitFor(() => changes.length > 0)

      expect(changes).toEqual([{ type: 'set', key: 'key', origin: 'remote' }])
    })
  })

  describe.skipIf(!hasFileSystem)('a recording that another tab is writing', () => {
    const driver = 'opfs'

    test('should be locked until the other tab closes its stream', async () => {
      const store = await sut.open({ driver, namespace, codec: new BinaryCodec() })
      await commands.openWriteStreamInSecondTab({ driver, namespace, key: 'recording', text: 'from the second tab' })

      await expect(store.set('recording', encoder.encode('x'), { wait: false })).rejects.toThrowError(
        StorageLockedError
      )
      await expect(store.delete('recording', { wait: false })).rejects.toThrowError(StorageLockedError)
      expect(await store.has('recording')).toBe(false)

      await commands.closeWriteStreamInSecondTab()

      expect(decoder.decode(await store.get('recording'))).toBe('from the second tab')
      expect(await store.delete('recording', { wait: false })).toBe(true)
    })

    test('should be free again when the other tab is closed without finishing', async () => {
      const store = await sut.open({ driver, namespace, codec: new BinaryCodec() })
      await commands.openWriteStreamInSecondTab({ driver, namespace, key: 'recording', text: 'never finished' })

      await commands.closeSecondTab()
      await store.set('recording', encoder.encode('from the first tab'))

      expect(decoder.decode(await store.get('recording'))).toBe('from the first tab')
    })
  })
})
