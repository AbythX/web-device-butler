import { beforeEach, describe, expect, test, vi } from 'vitest'
import { type MockProxy, mock } from 'vitest-mock-extended'

import { CrossTabLock } from './cross-tab-lock.ts'
import { DeviceEnvironment } from '../../environment/device-environment.ts'
import { InTabLockManager } from './in-tab-lock-manager.ts'
import type { Logger } from '../../logging/logger.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

describe('cross-tab-lock', () => {
  let logger!: MockProxy<Logger>
  /** stands for the lock manager of the browser, which every tab of the origin shares */
  let browserLocks!: InTabLockManager

  /** a lock as a tab of a browser with Web Locks would create it */
  const createForTab = () =>
    new CrossTabLock(DeviceEnvironment.of({ navigator: { locks: browserLocks } as unknown as Navigator }), logger)

  /** a lock as a tab of a browser without Web Locks would create it */
  const createWithoutWebLocks = (fallback: InTabLockManager) =>
    new CrossTabLock(DeviceEnvironment.of({ navigator: {} as Navigator }), logger, fallback)

  beforeEach(() => {
    logger = mock<Logger>()
    browserLocks = new InTabLockManager()
  })

  describe('#acquire', () => {
    test('should return the held lock', async () => {
      const sut = createForTab()

      const handle = await sut.acquire('camera')

      expect(handle.name).toBe('camera')
      expect(handle.mode).toBe('exclusive')
      expect(handle.isReleased).toBe(false)
      expect(await sut.isHeld('camera')).toBe(true)
    })

    test('should keep another tab waiting until the lock is released', async () => {
      const firstTab = createForTab()
      const secondTab = createForTab()
      const handle = await firstTab.acquire('camera')

      const acquired = vi.fn()

      const waiting = secondTab.acquire('camera').then((second) => {
        acquired()

        return second
      })

      await flush()
      expect(acquired).not.toHaveBeenCalled()

      handle.release()

      expect((await waiting).isReleased).toBe(false)
    })

    test('should grant shared locks to several tabs at once', async () => {
      const first = await createForTab().acquire('microphone', { mode: 'shared' })
      const second = await createForTab().acquire('microphone', { mode: 'shared' })

      expect(first.mode).toBe('shared')
      expect(second.mode).toBe('shared')
    })

    test('should release the lock when the handle is disposed', async () => {
      const sut = createForTab()

      {
        using handle = await sut.acquire('camera')
        expect(handle.isReleased).toBe(false)
      }

      await flush()

      expect(await sut.isHeld('camera')).toBe(false)
    })

    test('should allow releasing a handle more than once', async () => {
      const sut = createForTab()
      const handle = await sut.acquire('camera')

      handle.release()
      handle.release()
      await flush()

      expect(handle.isReleased).toBe(true)
      expect(await sut.isHeld('camera')).toBe(false)
    })

    test('should stop waiting and reject with the reason once the signal is aborted', async () => {
      const sut = createForTab()
      const handle = await sut.acquire('camera')
      const controller = new AbortController()
      const reason = new Error('no longer needed')

      const waiting = sut.acquire('camera', { signal: controller.signal })
      controller.abort(reason)

      await expect(waiting).rejects.toThrowError(reason)
      handle.release()
    })
  })

  describe('#tryAcquire', () => {
    test('should return the held lock if it is free', async () => {
      const handle = await createForTab().tryAcquire('camera')

      expect(handle?.isReleased).toBe(false)
    })

    test('should return undefined without waiting if another tab holds the lock', async () => {
      const handle = await createForTab().acquire('camera')

      expect(await createForTab().tryAcquire('camera')).toBeUndefined()

      handle.release()
    })

    test('should return a shared lock next to another shared lock', async () => {
      await createForTab().acquire('microphone', { mode: 'shared' })

      const handle = await createForTab().tryAcquire('microphone', 'shared')

      expect(handle?.mode).toBe('shared')
    })
  })

  describe('#run', () => {
    test('should hold the lock while the task runs and release it afterwards', async () => {
      const sut = createForTab()

      const result = await sut.run('settings', async () => {
        expect(await sut.isHeld('settings')).toBe(true)

        return 'done'
      })

      await flush()

      expect(result).toBe('done')
      expect(await sut.isHeld('settings')).toBe(false)
    })

    test('should release the lock and rethrow if the task fails', async () => {
      const sut = createForTab()
      const error = new Error('task failed')

      await expect(sut.run('settings', () => Promise.reject(error))).rejects.toThrowError(error)
      await flush()

      expect(await sut.isHeld('settings')).toBe(false)
    })

    test('should run the tasks of two tabs one after another', async () => {
      const firstTab = createForTab()
      const secondTab = createForTab()
      let counter = 0

      // a read-modify-write that loses an update if both tasks overlap
      const increment = async () => {
        const current = counter
        await flush()
        counter = current + 1
      }

      await Promise.all([firstTab.run('counter', increment), secondTab.run('counter', increment)])

      expect(counter).toBe(2)
    })
  })

  describe('#isHeld', () => {
    test('should report a lock that is held by another tab', async () => {
      const handle = await createForTab().acquire('camera')
      const sut = createForTab()

      expect(await sut.isHeld('camera')).toBe(true)
      expect(await sut.isHeld('microphone')).toBe(false)

      handle.release()
      await flush()
      expect(await sut.isHeld('camera')).toBe(false)
    })

    test('should not take a shared lock for held if asked for a shared request', async () => {
      await createForTab().acquire('microphone', { mode: 'shared' })
      const sut = createForTab()

      expect(await sut.isHeld('microphone', 'shared')).toBe(false)
      expect(await sut.isHeld('microphone', 'exclusive')).toBe(true)
      expect(await sut.isHeld('microphone')).toBe(true)
    })

    test('should take an exclusive lock for held, whatever the request', async () => {
      await createForTab().acquire('microphone')
      const sut = createForTab()

      expect(await sut.isHeld('microphone', 'shared')).toBe(true)
    })
  })

  describe('without the Web Locks API', () => {
    test('should report that it does not reach other tabs', async () => {
      expect(createForTab().isCrossTab).toBe(true)
      expect(createWithoutWebLocks(new InTabLockManager()).isCrossTab).toBe(false)
      expect(new CrossTabLock(DeviceEnvironment.of({}), logger).isCrossTab).toBe(false)
    })

    test('should still coordinate the instances inside the tab', async () => {
      const fallback = new InTabLockManager()
      const handle = await createWithoutWebLocks(fallback).acquire('camera')

      expect(await createWithoutWebLocks(fallback).tryAcquire('camera')).toBeUndefined()

      handle.release()
    })

    test('should share the fallback between instances by default', async () => {
      const environment = DeviceEnvironment.of({})
      const handle = await new CrossTabLock(environment, logger).acquire('cross-tab-lock.spec')

      expect(await new CrossTabLock(environment, logger).tryAcquire('cross-tab-lock.spec')).toBeUndefined()

      handle.release()
    })

    test('should log the limitation once', async () => {
      const sut = createWithoutWebLocks(new InTabLockManager())
      expect(logger.warn).not.toHaveBeenCalled()

      ;(await sut.acquire('camera')).release()
      ;(await sut.acquire('camera')).release()

      expect(logger.warn).toHaveBeenCalledTimes(1)
    })
  })
})
