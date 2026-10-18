import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import type { Logger } from '../../../core/logging/logger.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import type { StorageManager } from '../../../storage/storage-manager.ts'
import type { Store } from '../../../storage/store/store.ts'
import { FakeStorageBrowser } from '../../../storage/testing/fake-storage-browser.ts'
import { CameraDescriptor } from '../model/camera-descriptor.ts'
import { CameraFeatures } from '../model/camera-features.ts'
import { CameraProbeCache } from './camera-probe-cache.ts'

const listed = (id: string, label = id) =>
  new CameraDescriptor(id, `group-${id}`, label, 'listed', 'back', CameraFeatures.none)

const probed = (id: string, torch = true) =>
  new CameraDescriptor(id, `group-${id}`, id, 'probed', 'back', new CameraFeatures({ torch, focusModes: [] }))

describe('camera-probe-cache', () => {
  let browser!: FakeStorageBrowser
  let storage!: StorageManager
  let sut!: CameraProbeCache

  const cameras = [listed('a'), listed('b')]

  beforeEach(() => {
    browser = new FakeStorageBrowser()
    storage = browser.openTab()
    sut = CameraProbeCache.in(storage, new NullLogger())
  })

  afterEach(() => {
    browser.close()
  })

  describe('#apply', () => {
    test('should return the listed cameras if nothing is remembered', async () => {
      expect(await sut.apply(cameras)).toEqual(cameras)
    })

    test('should replace the cameras that were looked at', async () => {
      await sut.remember(cameras, [probed('b')])

      const [first, second] = await sut.apply(cameras)

      expect(first).toEqual(listed('a'))
      expect(second?.detail).toBe('probed')
      expect(second?.features.torch).toBe(true)
    })

    test('should keep the label of the list, which follows the language of the system', async () => {
      await sut.remember(cameras, [probed('b')])

      const [, second] = await sut.apply([listed('a'), listed('b', 'Rückkamera')])

      expect(second?.label).toBe('Rückkamera')
      expect(second?.detail).toBe('probed')
    })

    test('should not care about the order of the list', async () => {
      await sut.remember(cameras, [probed('a')])

      const [first, second] = await sut.apply([listed('b'), listed('a')])

      expect([first?.detail, second?.detail]).toEqual(['listed', 'probed'])
    })

    test.each([
      ['a camera was plugged in', [listed('a'), listed('b'), listed('c')]],
      ['a camera was removed', [listed('a')]],
      ['the browser gave the cameras new ids', [listed('x'), listed('y')]],
    ])('should forget everything if %s', async (_name, now) => {
      await sut.remember(cameras, [probed('a'), probed('b')])

      expect((await sut.apply(now)).every((camera) => camera.detail === 'listed')).toBe(true)
      expect(await sut.all()).toEqual([])
    })

    test.each([
      ['is empty', []],
      ['has no ids', [listed('')]],
    ])('should neither use nor forget what is remembered if the list %s', async (_name, now) => {
      await sut.remember(cameras, [probed('a')])

      expect(await sut.apply(now)).toEqual(now)
      expect(await sut.all()).toHaveLength(1)
    })

    test('should be shared by the tabs and survive the page', async () => {
      await sut.remember(cameras, [probed('a')])

      const other = CameraProbeCache.in(browser.openTab(), new NullLogger())

      expect((await other.apply(cameras))[0]?.detail).toBe('probed')
    })

    test('should ignore what another version of the library wrote', async () => {
      const store = await storage.open({ driver: 'local', namespace: 'camera-probes' })
      await store.set('cameras', { version: 99, ids: ['a', 'b'], cameras: [probed('a').toJSON()] })

      expect(await sut.apply(cameras)).toEqual(cameras)
    })

    test('should skip a camera it cannot read', async () => {
      const store = await storage.open({ driver: 'local', namespace: 'camera-probes' })
      await store.set('cameras', { version: 1, ids: ['a', 'b'], cameras: [{ id: 'a' }, probed('b').toJSON()] })

      const [first, second] = await sut.apply(cameras)

      expect([first?.detail, second?.detail]).toEqual(['listed', 'probed'])
    })
  })

  describe('#remember', () => {
    test('should add to what is remembered about the same cameras', async () => {
      await sut.remember(cameras, [probed('a')])
      await sut.remember(cameras, [probed('b')])

      expect((await sut.all()).map((camera) => camera.id)).toEqual(['a', 'b'])
    })

    test('should replace what was remembered about a camera', async () => {
      await sut.remember(cameras, [probed('a', false)])
      await sut.remember(cameras, [probed('a', true)])

      const remembered = await sut.all()
      expect(remembered).toHaveLength(1)
      expect(remembered[0]?.features.torch).toBe(true)
    })

    test('should start over for another set of cameras', async () => {
      await sut.remember(cameras, [probed('a')])
      await sut.remember([listed('x')], [probed('x')])

      expect((await sut.all()).map((camera) => camera.id)).toEqual(['x'])
    })

    test('should lose nothing when two tabs remember at the same time', async () => {
      const other = CameraProbeCache.in(browser.openTab(), new NullLogger())

      await Promise.all([sut.remember(cameras, [probed('a')]), other.remember(cameras, [probed('b')])])

      expect((await sut.all()).map((camera) => camera.id).sort()).toEqual(['a', 'b'])
    })

    test('should write nothing if no camera was looked at', async () => {
      await sut.remember(cameras, [])

      expect(browser.localStorage.length).toBe(0)
    })
  })

  describe('#clear', () => {
    test('should forget everything', async () => {
      await sut.remember(cameras, [probed('a')])

      await sut.clear()

      expect(await sut.all()).toEqual([])
      expect(await sut.apply(cameras)).toEqual(cameras)
    })
  })

  describe('without working storage', () => {
    test('should fall back to the memory of the page where there is no localStorage', async () => {
      browser = new FakeStorageBrowser({ localStorage: undefined })
      sut = CameraProbeCache.in(browser.openTab(), new NullLogger())

      await sut.remember(cameras, [probed('a')])

      expect((await sut.apply(cameras))[0]?.detail).toBe('probed')
    })

    test('should remember nothing and fail no call if the store cannot be opened', async () => {
      const logger = mock<Logger>()
      sut = new CameraProbeCache(() => Promise.reject(new Error('no storage')), logger)

      await sut.remember(cameras, [probed('a')])
      await sut.clear()

      expect(await sut.apply(cameras)).toEqual(cameras)
      expect(await sut.all()).toEqual([])
      expect(logger.warn).toHaveBeenCalled()
    })

    test('should try to open the store again after it failed', async () => {
      const store = await storage.open({ driver: 'memory', namespace: 'camera-probes' })
      let attempts = 0
      sut = new CameraProbeCache(
        () => (attempts++ === 0 ? Promise.reject(new Error('not yet')) : Promise.resolve(store as Store<unknown>)),
        new NullLogger()
      )

      await sut.remember(cameras, [probed('a')])
      await sut.remember(cameras, [probed('a')])

      expect(await sut.all()).toHaveLength(1)
    })
  })
})
