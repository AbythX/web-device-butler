import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { MemoryStorageDriver } from './drivers/memory/memory-storage-driver.ts'
import { StorageUnsupportedError } from './errors/storage-unsupported-error.ts'
import { StorageSpace } from './space/storage-space.ts'
import { DefaultStorageSpaceWatch } from './space/default-storage-space-watch.ts'
import { DefaultStorageManager } from './default-storage-manager.ts'
import type { StorageManager } from './storage-manager.ts'
import { DefaultStore } from './store/default-store.ts'
import { FakeStorageBrowser } from './testing/fake-storage-browser.ts'

class CustomStorageDriver extends MemoryStorageDriver {
  public override readonly name: string = 'custom'
}

class UnsupportedStorageDriver extends MemoryStorageDriver {
  public override readonly name: string = 'unsupported'

  public override isSupported(): Promise<boolean> {
    return Promise.resolve(false)
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

describe('default-storage-manager', () => {
  let browser!: FakeStorageBrowser
  let sut!: StorageManager

  beforeEach(() => {
    browser = new FakeStorageBrowser()
    sut = browser.openTab()
  })

  afterEach(() => {
    browser.close()
  })

  describe('#create', () => {
    test('should not touch the environment', async () => {
      const resolveGlobals = vi.fn(() => ({}))

      using manager = DefaultStorageManager.create({}, new BrowserEnvironment(resolveGlobals))

      expect(manager).toBeInstanceOf(DefaultStorageManager)
      expect(resolveGlobals).not.toHaveBeenCalled()
    })

    test('should work without arguments and outside a browser', async () => {
      using manager = DefaultStorageManager.create()

      const store = await manager.open({ driver: ['local', 'session', 'memory'], namespace: 'test' })
      await store.set('key', 'value')

      expect(store.capabilities.driver).toBe('memory')
      expect(await store.get('key')).toBe('value')
    })
  })

  describe('#open', () => {
    test.each(['local', 'session', 'memory'])('should open a store on the %s driver', async (driver) => {
      const store = await sut.open({ driver, namespace: 'test' })

      expect(store).toBeInstanceOf(DefaultStore)
      expect(store.capabilities.driver).toBe(driver)
    })

    test('should use the first driver of a list that is supported', async () => {
      sut.register(new UnsupportedStorageDriver())

      const store = await sut.open({ driver: ['unsupported', 'memory', 'local'], namespace: 'test' })

      expect(store.capabilities.driver).toBe('memory')
    })

    test('should skip a driver whose support check fails', async () => {
      const driver = new UnsupportedStorageDriver()
      vi.spyOn(driver, 'isSupported').mockRejectedValue(new Error('check failed'))
      sut.register(driver)

      const store = await sut.open({ driver: ['unsupported', 'memory'], namespace: 'test' })

      expect(store.capabilities.driver).toBe('memory')
    })

    test('should fail if none of the drivers is supported', async () => {
      sut.register(new UnsupportedStorageDriver())
      const environment = BrowserEnvironment.of({})
      using withoutStorage = DefaultStorageManager.create({}, environment)
      withoutStorage.register(new UnsupportedStorageDriver())

      await expect(sut.open({ driver: 'unsupported', namespace: 'test' })).rejects.toThrowError(StorageUnsupportedError)
      await expect(withoutStorage.open({ driver: ['local', 'unsupported'], namespace: 'test' })).rejects.toThrowError(
        "None of the 2 storage drivers fits the requirements: 'local' lacks support in this browser; " +
          "'unsupported' lacks support in this browser"
      )
    })

    test('should choose a backend by itself if none is named', async () => {
      const store = await sut.open({ namespace: 'test' })

      expect(store.capabilities.driver).toBe('indexeddb')
    })

    test('should choose the backend that has what is required and most of what is preferred', async () => {
      const files = await sut.open({ namespace: 'a', require: { persistence: 'origin' }, prefer: { streaming: true } })
      const tab = await sut.open({ namespace: 'b', require: { persistence: 'tab' } })
      const page = await sut.open({ namespace: 'c', require: { persistence: 'page' }, prefer: { streaming: true } })

      expect(files.capabilities.driver).toBe('opfs')
      expect(tab.capabilities.driver).toBe('session')
      expect(page.capabilities.driver).toBe('memory')
    })

    test('should fall back to the next backend that fits where the best one does not work', async () => {
      const environment = BrowserEnvironment.of({ localStorage: browser.localStorage })
      using withoutFiles = DefaultStorageManager.create({}, environment)

      const store = await withoutFiles.open({ namespace: 'test', prefer: { streaming: true, persistence: 'origin' } })

      expect(store.capabilities.driver).toBe('local')
    })

    test('should only choose among the named backends, and only one that has what is required', async () => {
      const store = await sut.open({
        driver: ['local', 'memory', 'opfs'],
        namespace: 'test',
        require: { binary: true },
      })

      expect(store.capabilities.driver).toBe('memory')
    })

    test('should say what each backend lacks if none fits', async () => {
      const opening = sut.open({ driver: ['local', 'session'], namespace: 'test', require: { streaming: true } })

      await expect(opening).rejects.toThrowError(StorageUnsupportedError)
      await expect(opening).rejects.toThrowError("'local' lacks streaming; 'session' lacks streaming")
    })

    test('should use the driver and the traits of the configuration where a call names none', async () => {
      const configured = browser.openTab({ driver: ['session', 'local'], require: { persistence: 'origin' } })

      expect((await configured.open({ namespace: 'test' })).capabilities.driver).toBe('local')
      expect((await configured.open({ namespace: 'test', require: {} })).capabilities.driver).toBe('session')
      expect((await configured.open({ namespace: 'test', driver: 'indexeddb' })).capabilities.driver).toBe('indexeddb')
    })

    test('should ask for the protection against eviction that is required or preferred', async () => {
      await sut.open({ namespace: 'plain' })
      const before = browser.isPersistent

      await sut.open({ namespace: 'kept', prefer: { persistent: true } })

      expect(before).toBe(false)
      expect(browser.isPersistent).toBe(true)
    })

    test('should fail if the browser refuses a protection against eviction that is required', async () => {
      const storage = { persist: async () => false, persisted: async () => false }
      // SAFETY: a browser that has a storage manager, but refuses to protect the data
      const navigator = { storage } as unknown as Navigator

      using refused = DefaultStorageManager.create(
        {},
        BrowserEnvironment.of({ navigator, localStorage: browser.localStorage })
      )

      const required = refused.open({ driver: 'local', namespace: 'test', require: { persistent: true } })
      const preferred = await refused.open({ driver: 'local', namespace: 'test', prefer: { persistent: true } })

      await expect(required).rejects.toThrowError(
        'The browser does not protect the data of the origin against eviction'
      )
      expect(preferred.capabilities.driver).toBe('local')
    })

    test('should fail for a driver that is not registered, even if another one of the list is supported', async () => {
      await expect(sut.open({ driver: ['typo', 'memory'], namespace: 'test' })).rejects.toThrowError(TypeError)
      await expect(sut.open({ driver: [], namespace: 'test' })).rejects.toThrowError(StorageUnsupportedError)
    })

    test('should fail without a namespace', async () => {
      await expect(sut.open({ driver: 'memory', namespace: '' })).rejects.toThrowError(TypeError)
    })

    test('should check the support of a driver once', async () => {
      const driver = new CustomStorageDriver()
      const isSupported = vi.spyOn(driver, 'isSupported')
      sut.register(driver)

      await sut.open({ driver: 'custom', namespace: 'first' })
      await sut.open({ driver: 'custom', namespace: 'second' })
      await sut.isSupported('custom')

      expect(isSupported).toHaveBeenCalledTimes(1)
    })

    test('should check a driver again that was not supported', async () => {
      const driver = new UnsupportedStorageDriver()
      const isSupported = vi.spyOn(driver, 'isSupported').mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      sut.register(driver)

      expect(await sut.isSupported('unsupported')).toBe(false)
      expect(await sut.isSupported('unsupported')).toBe(true)
      expect(isSupported).toHaveBeenCalledTimes(2)
    })

    test('should prefix the namespace with the namespace of the application', async () => {
      const store = await browser.openTab({ namespace: 'my-app' }).open({ driver: 'local', namespace: 'settings' })
      const withDefault = await sut.open({ driver: 'local', namespace: 'settings' })

      await store.set('theme', 'dark')
      await withDefault.set('theme', 'light')

      expect(browser.localStorage.key(0)).toBe('my-app.settings:theme')
      expect(browser.localStorage.key(1)).toBe('web-device-butler.settings:theme')
    })

    test('should keep applications apart whose namespaces contain a dot', async () => {
      const first = await browser.openTab({ namespace: 'a.b' }).open({ driver: 'local', namespace: 'c' })
      const second = await browser.openTab({ namespace: 'a' }).open({ driver: 'local', namespace: 'b.c' })

      await first.set('key', 'first')
      await second.set('key', 'second')

      expect(await first.get('key')).toBe('first')
      expect(await second.get('key')).toBe('second')
    })
  })

  describe('#register', () => {
    test('should replace a driver whose code was not loaded yet', async () => {
      class OwnFileSystemDriver extends MemoryStorageDriver {
        public override readonly name: string = 'opfs'
      }

      const driver = new OwnFileSystemDriver()
      sut.register(driver)

      const store = await sut.open({ driver: 'opfs', namespace: 'test' })

      expect(store.capabilities).toBe(driver.capabilities)
      expect(await sut.isSupported('opfs')).toBe(true)
    })

    test('should load a driver once for stores that are opened at the same time', async () => {
      const [first, second] = await Promise.all([
        sut.open({ driver: 'indexeddb', namespace: 'first' }),
        sut.open({ driver: 'indexeddb', namespace: 'second' }),
      ])

      expect(first.capabilities).toBe(second.capabilities)
    })

    test('should make a custom driver available under its name', async () => {
      sut.register(new CustomStorageDriver())

      const store = await sut.open({ driver: 'custom', namespace: 'test' })
      await store.set('key', 'value')

      expect(store.capabilities.driver).toBe('memory')
      expect(await store.get('key')).toBe('value')
    })

    test('should replace a driver of the same name for stores that are opened afterwards', async () => {
      const before = await sut.open({ driver: 'memory', namespace: 'test' })
      await before.set('key', 'value')

      sut.register(new MemoryStorageDriver())
      const after = await sut.open({ driver: 'memory', namespace: 'test' })

      expect(await before.get('key')).toBe('value')
      expect(await after.get('key')).toBeUndefined()
    })
  })

  describe('#isSupported', () => {
    test('should tell whether a driver can be used', async () => {
      sut.register(new UnsupportedStorageDriver())

      expect(await sut.isSupported('local')).toBe(true)
      expect(await sut.isSupported('session')).toBe(true)
      expect(await sut.isSupported('memory')).toBe(true)
      expect(await sut.isSupported('unsupported')).toBe(false)
      expect(await sut.isSupported('unknown')).toBe(false)
    })

    test('should not support the storage of the browser where there is none', async () => {
      using manager = DefaultStorageManager.create({}, BrowserEnvironment.of({}))

      expect(await manager.isSupported('local')).toBe(false)
      expect(await manager.isSupported('session')).toBe(false)
      expect(await manager.isSupported('memory')).toBe(true)
    })
  })

  describe('#prepare', () => {
    test('should say which backend a store would be kept in, without opening one', async () => {
      const result = await sut.prepare({ require: { streaming: true } })

      expect(result.capabilities?.driver).toBe('opfs')
      expect(result.isPersistent).toBe(false)
      expect(result.error).toBeUndefined()
    })

    test('should use the requirements of the configuration', async () => {
      const configured = browser.openTab({ require: { persistence: 'tab' } })

      expect((await configured.prepare()).capabilities?.driver).toBe('session')
    })

    test('should ask for the protection against eviction that is preferred', async () => {
      const result = await sut.prepare({ prefer: { persistent: true } })

      expect(result.isPersistent).toBe(true)
    })

    test('should report that no backend fits instead of throwing', async () => {
      const result = await sut.prepare({ driver: 'local', require: { binary: true } })

      expect(result.capabilities).toBeUndefined()
      expect(result.error).toBeInstanceOf(StorageUnsupportedError)
      expect(result.error?.message).toContain("'local' lacks binary values")
    })
  })

  describe('#space / #persist', () => {
    test('should report the space of the origin', async () => {
      const space = await sut.space()

      expect(space).toBeInstanceOf(StorageSpace)
      expect(space).toMatchObject({ isKnown: true, quota: 1000, usage: 250, available: 750, isPersistent: false })
    })

    test('should ask the browser to persist and report the new state', async () => {
      expect(await sut.persist()).toBe(true)
      expect((await sut.space()).isPersistent).toBe(true)
    })

    test('should report an unknown space where the browser gives no estimate', async () => {
      using manager = DefaultStorageManager.create({}, BrowserEnvironment.of({}))

      expect((await manager.space()).isKnown).toBe(false)
      expect(await manager.persist()).toBe(false)
    })
  })

  describe('#watchSpace', () => {
    test('should return a watch that reports the space', async () => {
      using watch = sut.watchSpace({ interval: 60_000 })
      const listener = vi.fn()
      watch.on('change', listener)
      await flush()

      expect(watch).toBeInstanceOf(DefaultStorageSpaceWatch)
      expect(listener).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ usage: 250 }))
    })

    test('should read the space again when another tab announces a write', async () => {
      using watch = sut.watchSpace({ interval: 60_000 })
      const listener = vi.fn()
      watch.on('change', listener)
      await flush()

      browser.estimate.usage = 600
      await (await browser.openTab().open({ driver: 'local', namespace: 'test' })).set('key', 'value')
      await flush()

      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ usage: 600 }))
    })
  })

  describe('#dispose', () => {
    test('should stop the watches and the change events', async () => {
      const store = await sut.open({ driver: 'local', namespace: 'test' })
      const onChange = vi.fn()
      store.on('change', onChange)
      const watch = sut.watchSpace({ interval: 60_000 })
      await flush()
      const onSpace = vi.fn()
      watch.on('change', onSpace)

      sut.dispose()
      browser.estimate.usage = 600
      await (await browser.openTab().open({ driver: 'local', namespace: 'test' })).set('key', 'value')
      await watch.refresh()
      await flush()

      expect(onChange).not.toHaveBeenCalled()
      expect(onSpace).not.toHaveBeenCalled()
    })

    test('should close the drivers', async () => {
      const driver = new CustomStorageDriver()
      const close = vi.spyOn(driver, 'close')
      sut.register(driver)

      sut.dispose()

      expect(close).toHaveBeenCalledTimes(1)
    })
  })
})
