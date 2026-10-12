import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { type MockProxy, mock } from 'vitest-mock-extended'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { BinaryCodec } from '../codecs/binary-codec.ts'
import { JsonCodec } from '../codecs/json-codec.ts'
import { TextCodec } from '../codecs/text-codec.ts'
import { MemoryStorageDriver } from '../drivers/memory/memory-storage-driver.ts'
import { StorageCodecError } from '../errors/storage-codec-error.ts'
import { StorageError } from '../errors/storage-error.ts'
import { StorageLockedError } from '../errors/storage-locked-error.ts'
import { StorageQuotaExceededError } from '../errors/storage-quota-exceeded-error.ts'
import { StorageUnsupportedError } from '../errors/storage-unsupported-error.ts'
import { StorageVersionError } from '../errors/storage-version-error.ts'
import { DefaultStorageManager } from '../default-storage-manager.ts'
import type { StorageManager } from '../storage-manager.ts'
import { FakeBrowser } from '../testing/fake-browser.ts'
import { FakeStorage } from '../testing/fake-storage.ts'
import type { Store } from './store.ts'
import type { StoreChange } from './store-change.ts'

// long enough for a task under a lock to have started: on `local` the store waits a moment after taking the lock
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 10))

const encoder = new TextEncoder()

const decoder = new TextDecoder()

const collect = async <Item>(items: AsyncIterable<Item>) => {
  const collected: Item[] = []

  for await (const item of items) {
    collected.push(item)
  }

  return collected
}

const readAll = async (stream: ReadableStream<Uint8Array> | undefined) =>
  stream === undefined ? undefined : decoder.decode(await new Response(stream).arrayBuffer())

describe('default-store', () => {
  let browser!: FakeBrowser
  let logger!: MockProxy<Logger>
  let tab!: StorageManager

  beforeEach(() => {
    browser = new FakeBrowser()
    logger = mock<Logger>()
    tab = browser.openTab({}, logger)
  })

  afterEach(() => {
    browser.close()
    vi.useRealTimers()
  })

  // every behaviour of the store has to hold for a driver of strings and for a driver of bytes
  describe.each(['local', 'memory', 'opfs', 'indexeddb'])('on the %s driver', (driver) => {
    let sut!: Store<unknown>

    beforeEach(async () => {
      sut = await tab.open({ driver, namespace: 'test' })
    })

    describe('#get / #set', () => {
      test('should return undefined for an entry that does not exist', async () => {
        expect(await sut.get('missing')).toBeUndefined()
      })

      test.each([[{ theme: 'dark', volume: 0.5, tags: ['a', 'b'] }], ['text'], [42], [false], [null], [[]]])(
        'should read back the value %j',
        async (value) => {
          await sut.set('key', value)

          expect(await sut.get('key')).toEqual(value)
        }
      )

      test('should replace an entry', async () => {
        await sut.set('key', 'first')
        await sut.set('key', 'second')

        expect(await sut.get('key')).toBe('second')
      })

      test('should read back strings with the text codec', async () => {
        const store = await tab.open({ driver, namespace: 'text', codec: new TextCodec() })

        await store.set('key', 'line one\nline two 🎥')

        expect(await store.get('key')).toBe('line one\nline two 🎥')
      })

      test('should read back bytes with the binary codec', async () => {
        const store = await tab.open({ driver, namespace: 'binary', codec: new BinaryCodec() })
        const bytes = new Uint8Array([0, 10, 13, 127, 128, 255])

        await store.set('key', bytes)

        expect(await store.get('key')).toEqual(bytes)
      })

      test('should read back many bytes with the binary codec', async () => {
        const store = await tab.open({ driver, namespace: 'binary', codec: new BinaryCodec() })
        const bytes = Uint8Array.from({ length: 200_000 }, (_, index) => index % 256)

        await store.set('key', bytes)

        expect(await store.get('key')).toEqual(bytes)
      })

      test('should fail with a codec error and write nothing if the value cannot be encoded', async () => {
        const set = sut.set('key', undefined)

        await expect(set).rejects.toThrowError(StorageCodecError)
        await expect(set).rejects.toThrowError(expect.objectContaining({ cause: expect.any(TypeError) }))
        expect(await sut.has('key')).toBe(false)
      })

      test('should fail with a codec error if the value cannot be decoded', async () => {
        await (await tab.open({ driver, namespace: 'test', codec: new TextCodec() })).set('key', 'not json')

        await expect(sut.get('key')).rejects.toThrowError(StorageCodecError)
      })

      test('should fail with a codec error if the validator of the codec rejects the value', async () => {
        const error = new Error('not a number')

        const codec = new JsonCodec<number>({
          parse: (value) => {
            if (typeof value !== 'number') {
              throw error
            }

            return value
          },
        })

        const store = await tab.open({ driver, namespace: 'test', codec })
        await sut.set('number', 1)
        await sut.set('text', 'one')

        expect(await store.get('number')).toBe(1)
        await expect(store.get('text')).rejects.toThrowError(expect.objectContaining({ cause: error }))
      })
    })

    describe('#has', () => {
      test('should tell whether there is an entry', async () => {
        await sut.set('key', null)

        expect(await sut.has('key')).toBe(true)
        expect(await sut.has('missing')).toBe(false)
      })
    })

    describe('#delete', () => {
      test('should delete an entry and tell whether there was one', async () => {
        await sut.set('key', 'value')

        expect(await sut.delete('key')).toBe(true)
        expect(await sut.delete('key')).toBe(false)
        expect(await sut.get('key')).toBeUndefined()
      })
    })

    describe('namespaces', () => {
      test('should not see the entries of another namespace', async () => {
        const other = await tab.open({ driver, namespace: 'other' })
        await sut.set('key', 'value')
        await other.set('other-key', 'other value')

        expect(await other.get('key')).toBeUndefined()
        expect(await collect(sut.keys())).toEqual(['key'])
      })

      test('should see the entries of a second store on the same namespace', async () => {
        const second = await tab.open({ driver, namespace: 'test' })

        await sut.set('key', 'value')

        expect(await second.get('key')).toBe('value')
      })

      test('should not see the entries of another application on the same origin', async () => {
        const other = await browser.openTab({ namespace: 'other-app' }).open({ driver: 'local', namespace: 'test' })
        const local = await tab.open({ driver: 'local', namespace: 'test' })

        await local.set('key', 'value')

        expect(await other.get('key')).toBeUndefined()
      })

      test('should expose the name it was opened with', async () => {
        expect(sut.namespace).toBe('test')
        expect(sut.capabilities.driver).toBe(driver)
      })
    })

    describe('#keys / #entries', () => {
      test('should iterate over nothing in an empty store', async () => {
        expect(await collect(sut.keys())).toEqual([])
        expect(await collect(sut.entries())).toEqual([])
      })

      test('should iterate over the keys and the entries', async () => {
        await sut.set('a', 1)
        await sut.set('b', 2)
        await sut.set('c', 3)
        await sut.delete('b')

        expect((await collect(sut.keys())).sort()).toEqual(['a', 'c'])
        expect((await collect(sut.entries())).sort()).toEqual([
          ['a', 1],
          ['c', 3],
        ])
      })
    })

    describe('#clear', () => {
      test('should delete every entry of the store and nothing else', async () => {
        const other = await tab.open({ driver, namespace: 'other' })
        await sut.set('a', 1)
        await sut.set('b', 2)
        await other.set('c', 3)

        await sut.clear()

        expect(await collect(sut.keys())).toEqual([])
        expect(await other.get('c')).toBe(3)
      })
    })

    describe('#size', () => {
      test('should grow and shrink with the entries of the store', async () => {
        const other = await tab.open({ driver, namespace: 'other' })
        expect(await sut.size()).toBe(0)

        await sut.set('key', 'x'.repeat(1000))
        await other.set('key', 'x'.repeat(5000))
        const size = await sut.size()

        expect(size).toBeGreaterThanOrEqual(1000)
        expect(size).toBeLessThan(5000)

        await sut.delete('key')
        expect(await sut.size()).toBe(0)
      })
    })

    describe('ttl', () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'], now: 1_000_000 })
      })

      test('should keep an entry until its ttl has passed', async () => {
        await sut.set('key', 'value', { ttl: 1000 })

        vi.setSystemTime(1_000_999)
        expect(await sut.get('key')).toBe('value')
        expect(await sut.has('key')).toBe(true)

        vi.setSystemTime(1_001_000)
        expect(await sut.get('key')).toBeUndefined()
        expect(await sut.has('key')).toBe(false)
      })

      test('should keep an entry without ttl', async () => {
        await sut.set('key', 'value')

        vi.setSystemTime(Number.MAX_SAFE_INTEGER)

        expect(await sut.get('key')).toBe('value')
      })

      test('should drop the ttl when the entry is set again without one', async () => {
        await sut.set('key', 'first', { ttl: 1000 })
        await sut.set('key', 'second')

        vi.setSystemTime(2_000_000)

        expect(await sut.get('key')).toBe('second')
      })

      test.each(['get', 'has'] as const)('should remove an expired entry from the backend on %s', async (method) => {
        await sut.set('key', 'x'.repeat(100), { ttl: 1000 })
        vi.setSystemTime(2_000_000)

        await sut[method]('key')

        expect(await sut.size()).toBe(0)
      })

      test('should not list expired entries', async () => {
        await sut.set('short', 1, { ttl: 1000 })
        await sut.set('long', 2, { ttl: 5000 })
        vi.setSystemTime(1_002_000)

        expect(await collect(sut.keys())).toEqual(['long'])
        expect(await collect(sut.entries())).toEqual([['long', 2]])
      })

      test('should report an expired entry as missing when it is deleted', async () => {
        await sut.set('key', 'value', { ttl: 1000 })
        vi.setSystemTime(2_000_000)

        expect(await sut.delete('key')).toBe(false)
        expect(await sut.size()).toBe(0)
      })

      test('should pass an expired entry as undefined to update', async () => {
        await sut.set('count', 5, { ttl: 1000 })
        vi.setSystemTime(2_000_000)

        expect(await sut.update('count', (current) => ((current as number | undefined) ?? 0) + 1)).toBe(1)
      })

      test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('should refuse the ttl %s', async (ttl) => {
        await expect(sut.set('key', 'value', { ttl })).rejects.toThrowError(TypeError)
        expect(await sut.has('key')).toBe(false)
      })
    })

    describe('#update', () => {
      test('should pass the current value and store the result', async () => {
        await sut.set('count', 1)

        const result = await sut.update('count', (current) => (current as number) + 1)

        expect(result).toBe(2)
        expect(await sut.get('count')).toBe(2)
      })

      test('should pass undefined for an entry that does not exist', async () => {
        const fn = vi.fn(() => 'created')

        await sut.update('key', fn)

        expect(fn).toHaveBeenCalledExactlyOnceWith(undefined)
        expect(await sut.get('key')).toBe('created')
      })

      test('should accept an asynchronous function', async () => {
        await sut.update('key', async () => {
          await flush()

          return 'created'
        })

        expect(await sut.get('key')).toBe('created')
      })

      test('should store the result with a ttl', async () => {
        vi.useFakeTimers({ toFake: ['Date'], now: 1_000_000 })

        await sut.update('key', () => 'value', { ttl: 1000 })
        vi.setSystemTime(1_001_000)

        expect(await sut.get('key')).toBeUndefined()
      })

      test('should leave the entry as it was and free it if the function fails', async () => {
        const error = new Error('function failed')
        await sut.set('key', 'value')

        await expect(sut.update('key', () => Promise.reject(error))).rejects.toThrowError(error)

        expect(await sut.get('key')).toBe('value')
        await sut.set('key', 'next', { wait: false })
      })

      test('should not lose an update if several updates of the same store overlap', async () => {
        const increment = async (current: unknown) => {
          await flush()

          return ((current as number | undefined) ?? 0) + 1
        }

        await Promise.all(Array.from({ length: 10 }, () => sut.update('count', increment)))

        expect(await sut.get('count')).toBe(10)
      })
    })

    describe('#lock', () => {
      test('should read, write and delete the entry through the object it passes', async () => {
        await sut.set('key', 'value')

        const result = await sut.lock('key', async (entry) => {
          expect(entry.key).toBe('key')
          expect(await entry.get()).toBe('value')

          await entry.set('changed')
          expect(await entry.get()).toBe('changed')

          expect(await entry.delete()).toBe(true)
          expect(await entry.get()).toBeUndefined()

          await entry.set('final')

          return 'result'
        })

        expect(result).toBe('result')
        expect(await sut.get('key')).toBe('final')
      })

      test('should keep writers of the entry waiting until the task has finished', async () => {
        const order: string[] = []
        let finishTask!: () => void

        const task = sut.lock('key', async (entry) => {
          await new Promise<void>((resolve) => {
            finishTask = resolve
          })
          await entry.set('from the task')
          order.push('task')
        })

        await flush()
        const set = sut.set('key', 'from outside').then(() => order.push('set'))
        await flush()

        expect(order).toEqual([])
        finishTask()
        await Promise.all([task, set])

        expect(order).toEqual(['task', 'set'])
        expect(await sut.get('key')).toBe('from outside')
      })

      test('should not keep readers or other entries waiting', async () => {
        await sut.set('key', 'value')

        await sut.lock('key', async () => {
          expect(await sut.get('key')).toBe('value')
          await sut.set('other', 'value')
        })

        expect(await sut.get('other')).toBe('value')
      })

      test('should stop working once the task has finished', async () => {
        let leaked!: { get(): Promise<unknown>; set(value: unknown): Promise<void>; delete(): Promise<boolean> }
        await sut.lock('key', async (entry) => {
          leaked = entry
        })

        await expect(leaked.get()).rejects.toThrowError(StorageError)
        await expect(leaked.set('value')).rejects.toThrowError(StorageError)
        await expect(leaked.delete()).rejects.toThrowError(StorageError)
        expect(await sut.has('key')).toBe(false)
      })

      test('should free the entry if the task fails', async () => {
        const error = new Error('task failed')

        await expect(sut.lock('key', () => Promise.reject(error))).rejects.toThrowError(error)

        await sut.set('key', 'value', { wait: false })
      })
    })

    describe('an entry that is in use', () => {
      let finishTask!: () => void
      let task!: Promise<void>

      beforeEach(async () => {
        task = sut.lock('key', () => new Promise<void>((resolve) => (finishTask = resolve)))
        await flush()
      })

      afterEach(async () => {
        finishTask()
        await task
      })

      test('should fail immediately with wait: false', async () => {
        await expect(sut.set('key', 'value', { wait: false })).rejects.toThrowError(StorageLockedError)
        await expect(sut.delete('key', { wait: false })).rejects.toThrowError(StorageLockedError)
        await expect(sut.update('key', () => 'value', { wait: false })).rejects.toThrowError(StorageLockedError)
        await expect(sut.lock('key', async () => {}, { wait: false })).rejects.toThrowError(
          expect.objectContaining({ key: 'key' })
        )
      })

      test('should stop waiting when the signal is aborted', async () => {
        const controller = new AbortController()
        const reason = new Error('no longer needed')

        const set = sut.set('key', 'value', { signal: controller.signal })
        controller.abort(reason)

        await expect(set).rejects.toThrowError(reason)
        expect(await sut.has('key')).toBe(false)
      })

      test('should wait for the entry when everything is cleared', async () => {
        const store = await tab.open({ driver, namespace: 'clearing' })
        await store.set('free', 'value')
        await store.set('in use', 'value')
        let finish!: () => void
        const user = store.lock('in use', () => new Promise<void>((resolve) => (finish = resolve)))
        await flush()
        const cleared = vi.fn()

        const clear = store.clear().then(cleared)
        await flush()
        expect(cleared).not.toHaveBeenCalled()

        finish()
        await Promise.all([user, clear])
        expect(await collect(store.keys())).toEqual([])
      })

      test('should not remove an expired entry behind the back of its user', async () => {
        const store = await tab.open({ driver, namespace: 'expiring' })
        vi.useFakeTimers({ toFake: ['Date'], now: 1_000_000 })
        await store.set('key', 'x'.repeat(100), { ttl: 1000 })
        vi.setSystemTime(2_000_000)

        let finish!: () => void
        const user = store.lock('key', () => new Promise<void>((resolve) => (finish = resolve)))
        await flush()

        expect(await store.get('key')).toBeUndefined()
        expect(await store.size()).toBeGreaterThan(0)

        finish()
        await user
      })
    })

    describe('change events', () => {
      let changes!: StoreChange[]

      beforeEach(() => {
        changes = []
        sut.on('change', (change) => changes.push(change))
      })

      test('should report its own writes', async () => {
        await sut.set('key', 'value')
        await sut.update('key', () => 'updated')
        await sut.delete('key')

        expect(changes).toEqual([
          { type: 'set', key: 'key', origin: 'local' },
          { type: 'set', key: 'key', origin: 'local' },
          { type: 'delete', key: 'key', origin: 'local' },
        ])
      })

      test('should not report a delete of an entry that does not exist', async () => {
        await sut.delete('missing')

        expect(changes).toEqual([])
      })

      test('should report every entry that is cleared', async () => {
        await sut.set('a', 1)
        await sut.set('b', 2)
        changes.length = 0

        await sut.clear()

        expect(changes.map(({ type, key }) => `${type} ${key}`).sort()).toEqual(['delete a', 'delete b'])
      })

      test('should report the writes of another store on the same data in this tab', async () => {
        const second = await tab.open({ driver, namespace: 'test' })

        await second.set('key', 'value')

        expect(changes).toEqual([{ type: 'set', key: 'key', origin: 'local' }])
      })

      test('should not report the writes to another namespace', async () => {
        await (await tab.open({ driver, namespace: 'other' })).set('key', 'value')
        await flush()

        expect(changes).toEqual([])
      })

      test('should report an expired entry that was removed', async () => {
        vi.useFakeTimers({ toFake: ['Date'], now: 1_000_000 })
        await sut.set('key', 'value', { ttl: 1000 })
        changes.length = 0
        vi.setSystemTime(2_000_000)

        await sut.get('key')

        expect(changes).toEqual([{ type: 'delete', key: 'key', origin: 'local' }])
      })

      test('should stop reporting once the subscription is unsubscribed', async () => {
        const listener = vi.fn()
        const subscription = sut.on('change', listener)

        subscription.unsubscribe()
        await sut.set('key', 'value')

        expect(listener).not.toHaveBeenCalled()
        expect(changes).toHaveLength(1)
      })

      test('should complete the write and log if a listener fails', async () => {
        const error = new Error('listener failed')
        sut.on('change', () => {
          throw error
        })

        await sut.set('key', 'value')

        expect(await sut.get('key')).toBe('value')
        expect(logger.error).toHaveBeenCalledWith(expect.any(String), error)
      })
    })
  })

  describe('several tabs', () => {
    test('should see the entries another tab wrote to a driver that is shared by the origin', async () => {
      const first = await tab.open({ driver: 'local', namespace: 'test' })
      const second = await browser.openTab().open({ driver: 'local', namespace: 'test' })

      await first.set('key', 'value')

      expect(await second.get('key')).toBe('value')
    })

    test.each(['session', 'memory'])(
      'should not see the entries another tab wrote to the %s driver',
      async (driver) => {
        const first = await tab.open({ driver, namespace: 'test' })
        const second = await browser.openTab().open({ driver, namespace: 'test' })

        await first.set('key', 'value')

        expect(await second.get('key')).toBeUndefined()
      }
    )

    test('should not lose an update if the updates of several tabs overlap', async () => {
      const stores = await Promise.all(
        [tab, browser.openTab(), browser.openTab()].map((manager) =>
          manager.open<number>({ driver: 'local', namespace: 'test' })
        )
      )

      const increment = async (current: number | undefined) => {
        await flush()

        return (current ?? 0) + 1
      }

      await Promise.all(stores.flatMap((store) => Array.from({ length: 5 }, () => store.update('count', increment))))

      expect(await stores[0]!.get('count')).toBe(15)
    })

    test('should lose updates without update, which is why it exists', async () => {
      const first = await tab.open<number>({ driver: 'local', namespace: 'test' })
      const second = await browser.openTab().open<number>({ driver: 'local', namespace: 'test' })

      const increment = async (store: Store<number>) => {
        const current = (await store.get('count')) ?? 0
        await flush()
        await store.set('count', current + 1)
      }

      await Promise.all([increment(first), increment(second)])

      expect(await first.get('count')).toBe(1)
    })

    test('should keep another tab from writing an entry that is in use', async () => {
      const first = await tab.open({ driver: 'local', namespace: 'test' })
      const second = await browser.openTab().open({ driver: 'local', namespace: 'test' })
      let finishTask!: () => void
      const task = first.lock('key', () => new Promise<void>((resolve) => (finishTask = resolve)))
      await flush()

      await expect(second.set('key', 'value', { wait: false })).rejects.toThrowError(StorageLockedError)

      finishTask()
      await task
      await second.set('key', 'value', { wait: false })
    })

    test('should not lock across tabs for a driver that is not shared between them', async () => {
      const first = await tab.open({ driver: 'session', namespace: 'test' })
      const second = await browser.openTab().open({ driver: 'session', namespace: 'test' })
      let finishTask!: () => void
      const task = first.lock('key', () => new Promise<void>((resolve) => (finishTask = resolve)))
      await flush()

      await second.set('key', 'value', { wait: false })
      expect(await browser.locks.query()).toEqual({ held: [], pending: [] })

      finishTask()
      await task
    })

    test('should report the writes of another tab as remote changes', async () => {
      const first = await tab.open({ driver: 'local', namespace: 'test' })
      const second = await browser.openTab().open({ driver: 'local', namespace: 'test' })
      const changes: StoreChange[] = []
      second.on('change', (change) => changes.push(change))

      await first.set('key', 'value')
      await first.delete('key')
      await flush()

      expect(changes).toEqual([
        { type: 'set', key: 'key', origin: 'remote' },
        { type: 'delete', key: 'key', origin: 'remote' },
      ])
    })

    test('should give a backend that passes writes on with a delay time before it reports a remote change', async () => {
      const first = await tab.open({ driver: 'local', namespace: 'test' })
      const second = await browser.openTab().open({ driver: 'local', namespace: 'test' })
      const changes: StoreChange[] = []
      second.on('change', (change) => changes.push(change))

      await first.set('key', 'value')
      // the announcement itself has arrived by now
      await new Promise((resolve) => setTimeout(resolve, 1))
      const early = [...changes]
      await flush()

      expect(early).toEqual([])
      expect(changes).toEqual([{ type: 'set', key: 'key', origin: 'remote' }])
    })

    test('should not report the writes of another tab to another namespace or application', async () => {
      const store = await tab.open({ driver: 'local', namespace: 'test' })
      const listener = vi.fn()
      store.on('change', listener)

      await (await browser.openTab().open({ driver: 'local', namespace: 'other' })).set('key', 'value')
      await (
        await browser.openTab({ namespace: 'other-app' }).open({ driver: 'local', namespace: 'test' })
      ).set('key', 1)
      await flush()

      expect(listener).not.toHaveBeenCalled()
    })

    test('should not report the writes of another tab to a driver that is not shared between tabs', async () => {
      const first = await tab.open({ driver: 'session', namespace: 'test' })
      const second = await browser.openTab().open({ driver: 'session', namespace: 'test' })
      const listener = vi.fn()
      second.on('change', listener)

      await first.set('key', 'value')
      await flush()

      expect(listener).not.toHaveBeenCalled()
    })

    test('should fail without rewriting an entry that another tab wrote in a newer format', async () => {
      const store = await tab.open({ driver: 'local', namespace: 'test' })
      const newer = '{"v":2,"t":"s","x":"unknown"}\n"from the future"'
      browser.localStorage.setItem('web-device-butler.test:key', newer)

      await expect(store.get('key')).rejects.toThrowError(StorageVersionError)
      await expect(store.has('key')).rejects.toThrowError(
        expect.objectContaining({ key: 'key', found: 2, supported: 1 })
      )
      await expect(store.update('key', () => 'old format')).rejects.toThrowError(StorageVersionError)
      expect(browser.localStorage.getItem('web-device-butler.test:key')).toBe(newer)
    })
  })

  describe('entries of others', () => {
    test.each(['plain text', '{"theme":"dark"}', '{"v":"1","t":"s"}\nvalue', '{"v":1,"t":"x"}\nvalue', '\nvalue'])(
      'should fail with a codec error for the foreign entry %j',
      async (foreign) => {
        const store = await tab.open({ driver: 'local', namespace: 'test' })
        browser.localStorage.setItem('web-device-butler.test:key', foreign)

        await expect(store.get('key')).rejects.toThrowError(StorageCodecError)
        await expect(store.has('key')).rejects.toThrowError(StorageCodecError)
      }
    )

    test('should still delete and replace a foreign entry', async () => {
      const store = await tab.open({ driver: 'local', namespace: 'test' })
      browser.localStorage.setItem('web-device-butler.test:first', 'plain text')
      browser.localStorage.setItem('web-device-butler.test:second', 'plain text')

      expect(await store.delete('first')).toBe(true)
      await store.set('second', 'value')

      expect(await store.has('first')).toBe(false)
      expect(await store.get('second')).toBe('value')
    })

    test('should leave an entry it cannot read out of the keys and the entries, and say so', async () => {
      const store = await tab.open({ driver: 'local', namespace: 'test' })
      await store.set('mine', 1)
      browser.localStorage.setItem('web-device-butler.test:foreign', 'plain text')
      browser.localStorage.setItem('web-device-butler.test:newer', '{"v":2,"t":"s"}\n"from the future"')

      expect(await collect(store.keys())).toEqual(['mine'])
      expect(await collect(store.entries())).toEqual([['mine', 1]])
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("'foreign'"), expect.any(StorageCodecError))
    })
  })

  describe('a full storage', () => {
    test('should fail with the space of the origin and keep the old entry', async () => {
      browser = new FakeBrowser({}, new FakeStorage(200))
      const store = await browser.openTab().open({ driver: 'local', namespace: 'test' })
      await store.set('key', 'small')

      const set = store.set('key', 'x'.repeat(500))

      await expect(set).rejects.toThrowError(StorageQuotaExceededError)
      await expect(set).rejects.toThrowError(
        expect.objectContaining({
          space: expect.objectContaining({ quota: 1000, usage: 250, available: 750 }),
          cause: expect.any(DOMException),
        })
      )
      expect(await store.get('key')).toBe('small')
    })
  })

  describe('streams', () => {
    let sut!: Store<Uint8Array>

    const write = async (key: string, chunks: string[], options?: { ttl?: number }) => {
      const writer = (await sut.writeStream(key, options)).getWriter()

      for (const chunk of chunks) {
        await writer.write(encoder.encode(chunk))
      }

      return writer
    }

    beforeEach(async () => {
      sut = await tab.open({ driver: 'memory', namespace: 'recordings', codec: new BinaryCodec() })
    })

    test('should write a stream and read it back', async () => {
      await (await write('key', ['first ', 'second\n', 'third'])).close()

      expect(await readAll(await sut.readStream('key'))).toBe('first second\nthird')
    })

    test('should read back an empty stream', async () => {
      await (await write('key', [])).close()

      expect(await readAll(await sut.readStream('key'))).toBe('')
      expect(await sut.has('key')).toBe(true)
    })

    test('should read a streamed entry in one piece and the other way round', async () => {
      await (await write('streamed', ['first ', 'second'])).close()
      await sut.set('whole', encoder.encode('in one piece'))

      expect(decoder.decode(await sut.get('streamed'))).toBe('first second')
      expect(await readAll(await sut.readStream('whole'))).toBe('in one piece')
    })

    test('should read the stream of an entry that arrives in small chunks', async () => {
      const driver = new MemoryStorageDriver()
      vi.spyOn(driver, 'openReadStream').mockImplementation(async (namespace, key) => {
        const bytes = (await driver.read(namespace, key)) as Uint8Array

        return new ReadableStream<Uint8Array>({
          start: (controller) => {
            bytes.forEach((byte) => controller.enqueue(new Uint8Array([byte])))
            controller.close()
          },
        })
      })
      tab.register(driver)
      const store = await tab.open({ driver: 'memory', namespace: 'chunked', codec: new BinaryCodec() })
      await store.set('key', encoder.encode('byte by byte'))

      expect(await readAll(await store.readStream('key'))).toBe('byte by byte')
    })

    test('should return no stream for an entry that does not exist', async () => {
      expect(await sut.readStream('missing')).toBeUndefined()
      await sut.set('missing', encoder.encode('now it exists'), { wait: false })
    })

    test('should keep the old entry until the stream is closed', async () => {
      await sut.set('key', encoder.encode('old'))

      const writer = await write('key', ['new'])
      expect(decoder.decode(await sut.get('key'))).toBe('old')

      await writer.close()
      expect(decoder.decode(await sut.get('key'))).toBe('new')
    })

    test('should keep the old entry and free it if the stream is aborted', async () => {
      await sut.set('key', encoder.encode('old'))

      await (await write('key', ['new'])).abort()

      expect(decoder.decode(await sut.get('key'))).toBe('old')
      await sut.set('key', encoder.encode('next'), { wait: false })
    })

    test('should keep writers of the entry out until the write stream is closed', async () => {
      const second = await browser
        .openTab()
        .open({ driver: 'memory', namespace: 'recordings', codec: new BinaryCodec() })

      const writer = await write('key', ['recording'])

      await expect(sut.set('key', encoder.encode('x'), { wait: false })).rejects.toThrowError(StorageLockedError)
      await expect(sut.delete('key', { wait: false })).rejects.toThrowError(StorageLockedError)
      await expect(sut.writeStream('key', { wait: false })).rejects.toThrowError(StorageLockedError)
      await expect(sut.readStream('key', { wait: false })).rejects.toThrowError(StorageLockedError)
      await second.set('key', encoder.encode('the memory of another tab is not affected'), { wait: false })

      const deleted = sut.delete('key')
      await writer.close()

      expect(await deleted).toBe(true)
      expect(await sut.has('key')).toBe(false)
    })

    test('should keep writers of the entry out until the read stream has been read or cancelled', async () => {
      await sut.set('key', encoder.encode('value'))

      const first = await sut.readStream('key')
      const second = await sut.readStream('key', { wait: false })
      await expect(sut.set('key', encoder.encode('x'), { wait: false })).rejects.toThrowError(StorageLockedError)

      await readAll(first)
      await expect(sut.delete('key', { wait: false })).rejects.toThrowError(StorageLockedError)

      await second!.cancel()
      expect(await sut.delete('key', { wait: false })).toBe(true)
    })

    test('should let an entry that was written as a stream expire', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: 1_000_000 })
      await (await write('key', ['recording'], { ttl: 1000 })).close()

      vi.setSystemTime(1_000_500)
      expect(await readAll(await sut.readStream('key'))).toBe('recording')

      vi.setSystemTime(1_001_000)
      expect(await sut.readStream('key')).toBeUndefined()
      expect(await sut.size()).toBe(0)
    })

    test('should report a change when the write stream is closed, not before and not when aborted', async () => {
      const changes: StoreChange[] = []
      sut.on('change', (change) => changes.push(change))

      const writer = await write('key', ['recording'])
      expect(changes).toEqual([])

      await writer.close()
      await (await write('other', ['recording'])).abort()

      expect(changes).toEqual([{ type: 'set', key: 'key', origin: 'local' }])
    })

    test('should free the entry and fail the stream if the backend fails while writing', async () => {
      const driver = new MemoryStorageDriver()
      const error = new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      vi.spyOn(driver, 'openWriteStream').mockImplementation(async () => {
        let writes = 0

        return new WritableStream<Uint8Array>({
          write: () => {
            // the first write is the header of the store
            if (++writes > 1) {
              throw error
            }
          },
        })
      })
      tab.register(driver)
      const store = await tab.open({ driver: 'memory', namespace: 'failing', codec: new BinaryCodec() })

      const writer = (await store.writeStream('key')).getWriter()
      const failed = writer.write(encoder.encode('recording'))

      await expect(failed).rejects.toThrowError(StorageQuotaExceededError)
      await expect(failed).rejects.toThrowError(expect.objectContaining({ space: expect.anything(), cause: error }))
      await expect(writer.close()).rejects.toBeDefined()
      await store.set('key', encoder.encode('value'), { wait: false })
    })

    test('should free the entry if the backend cannot open the stream', async () => {
      const driver = new MemoryStorageDriver()
      const error = new DOMException('refused', 'SecurityError')
      vi.spyOn(driver, 'openWriteStream').mockRejectedValue(error)
      vi.spyOn(driver, 'openReadStream').mockRejectedValue(error)
      tab.register(driver)
      const store = await tab.open({ driver: 'memory', namespace: 'failing', codec: new BinaryCodec() })

      await expect(store.writeStream('key')).rejects.toThrowError(expect.objectContaining({ cause: error }))
      await expect(store.readStream('key')).rejects.toThrowError(expect.objectContaining({ cause: error }))
      await store.set('key', encoder.encode('value'), { wait: false })
    })

    test('should fail on a driver that cannot stream', async () => {
      const store = await tab.open({ driver: 'local', namespace: 'test' })

      await expect(store.readStream('key')).rejects.toThrowError(StorageUnsupportedError)
      await expect(store.writeStream('key')).rejects.toThrowError(StorageUnsupportedError)
    })
  })

  describe('streams on a driver that is shared by the origin', () => {
    const openRecordings = (manager: StorageManager) =>
      manager.open({ driver: 'opfs', namespace: 'recordings', codec: new BinaryCodec() })

    test('should let another tab read what was written as a stream', async () => {
      const first = await openRecordings(tab)
      const second = await openRecordings(browser.openTab())

      const writer = (await first.writeStream('key')).getWriter()
      await writer.write(encoder.encode('first '))
      await writer.write(encoder.encode('second'))
      await writer.close()

      expect(await readAll(await second.readStream('key'))).toBe('first second')
      expect(decoder.decode(await second.get('key'))).toBe('first second')
    })

    test('should keep another tab from writing or deleting a recording until its stream is closed', async () => {
      const first = await openRecordings(tab)
      const second = await openRecordings(browser.openTab())
      const changes: StoreChange[] = []
      second.on('change', (change) => changes.push(change))

      const writer = (await first.writeStream('key')).getWriter()
      await writer.write(encoder.encode('recording'))

      await expect(second.set('key', encoder.encode('x'), { wait: false })).rejects.toThrowError(StorageLockedError)
      await expect(second.delete('key', { wait: false })).rejects.toThrowError(StorageLockedError)
      await expect(second.clear({ wait: false })).resolves.toBeUndefined()
      expect(await second.has('key')).toBe(false)

      await writer.close()
      await flush()

      expect(changes).toEqual([{ type: 'set', key: 'key', origin: 'remote' }])
      expect(decoder.decode(await second.get('key'))).toBe('recording')
      expect(await second.delete('key', { wait: false })).toBe(true)
    })
  })

  describe('a failing backend', () => {
    test('should wrap what the backend throws and keep it as cause', async () => {
      const driver = new MemoryStorageDriver()
      const error = new Error('disk on fire')
      vi.spyOn(driver, 'read').mockRejectedValue(error)
      vi.spyOn(driver, 'write').mockRejectedValue(error)
      tab.register(driver)
      const store = await tab.open({ driver: 'memory', namespace: 'failing' })

      await expect(store.get('key')).rejects.toThrowError(StorageError)
      await expect(store.set('key', 'value')).rejects.toThrowError(expect.objectContaining({ cause: error }))
      await expect(store.set('key', 'value', { wait: false })).rejects.toThrowError(StorageError)
    })
  })
  describe('a backend that passes writes on to the other tabs with a delay', () => {
    test('should wait a moment after taking the lock, before it reads the entry', async () => {
      const store = await tab.open<number>({ driver: 'local', namespace: 'test' })
      await store.set('count', 1)
      vi.useFakeTimers()
      const fn = vi.fn((current: number | undefined) => (current ?? 0) + 1)

      const updating = store.update('count', fn)
      await vi.advanceTimersByTimeAsync(4)
      expect(fn).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(await updating).toBe(2)
    })

    test('should work on what another tab wrote while it waited', async () => {
      const store = await tab.open<number>({ driver: 'local', namespace: 'test' })
      const prefix = `${encodeURIComponent('web-device-butler.test')}:`
      await store.set('count', 1)
      const written = browser.localStorage.getItem(`${prefix}count`) as string

      const updating = store.update('count', (current) => (current ?? 0) + 1)
      // the write of the other tab arrives after the lock was taken
      browser.localStorage.setItem(`${prefix}count`, written.replace(/1$/, '41'))

      expect(await updating).toBe(42)
    })

    test.each(['memory', 'opfs', 'indexeddb'])('should not wait on the %s driver', async (driver) => {
      const store = await tab.open<number>({ driver, namespace: 'test' })
      const setTimeout = vi.spyOn(globalThis, 'setTimeout')

      await store.update('count', (current) => (current ?? 0) + 1)

      expect(store.capabilities.consistentAcrossTabs).toBe(true)
      expect(setTimeout).not.toHaveBeenCalled()
      setTimeout.mockRestore()
    })

    test('should not wait where the lock does not reach other tabs anyway', async () => {
      using manager = DefaultStorageManager.create({}, BrowserEnvironment.of({ localStorage: browser.localStorage }))
      const store = await manager.open<number>({ driver: 'local', namespace: 'test' })
      const setTimeout = vi.spyOn(globalThis, 'setTimeout')

      await store.update('count', (current) => (current ?? 0) + 1)

      expect(setTimeout).not.toHaveBeenCalled()
      setTimeout.mockRestore()
    })
  })
})
