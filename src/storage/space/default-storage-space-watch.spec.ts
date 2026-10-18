import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { type MockProxy, mock } from 'vitest-mock-extended'

import { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { StorageSpace } from './storage-space.ts'
import type { StorageSpaceReader } from './storage-space-reader.ts'
import { DefaultStorageSpaceWatch } from './default-storage-space-watch.ts'
import type { StorageSpaceWatch } from './storage-space-watch.ts'

describe('default-storage-space-watch', () => {
  let reader!: MockProxy<StorageSpaceReader>
  let watches!: StorageSpaceWatch[]

  const createWatch = (
    ...parameters: ConstructorParameters<typeof DefaultStorageSpaceWatch> extends [unknown, ...infer Rest]
      ? Rest
      : never
  ) => {
    const watch = new DefaultStorageSpaceWatch(reader, ...parameters)
    watches.push(watch)

    return watch
  }

  const spaceWith = (usage: number) => new StorageSpace(1000, usage, false)

  beforeEach(() => {
    vi.useFakeTimers()
    reader = mock<StorageSpaceReader>()
    reader.read.mockResolvedValue(spaceWith(100))
    watches = []
  })

  afterEach(() => {
    watches.forEach((watch) => watch.stop())
    vi.useRealTimers()
  })

  test('should read the space immediately and report it as a change', async () => {
    const sut = createWatch()
    const listener = vi.fn()
    sut.on('change', listener)
    expect(sut.current).toBeUndefined()

    await vi.advanceTimersByTimeAsync(0)

    expect(listener).toHaveBeenCalledExactlyOnceWith(spaceWith(100))
    expect(sut.current).toEqual(spaceWith(100))
  })

  test('should read the space again after every interval', async () => {
    createWatch({ interval: 5000 })
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(4999)
    expect(reader.read).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(reader.read).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(reader.read).toHaveBeenCalledTimes(4)
  })

  test('should poll every ten seconds by default', async () => {
    createWatch()

    await vi.advanceTimersByTimeAsync(30_000)

    expect(reader.read).toHaveBeenCalledTimes(4)
  })

  test('should only report a change if the space is different', async () => {
    const sut = createWatch({ interval: 1000 })
    const listener = vi.fn()
    sut.on('change', listener)

    await vi.advanceTimersByTimeAsync(2000)
    expect(listener).toHaveBeenCalledTimes(1)

    reader.read.mockResolvedValue(spaceWith(200))
    await vi.advanceTimersByTimeAsync(1000)

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(spaceWith(200))
  })

  describe('low', () => {
    test('should report when the available space crosses below the limit, once', async () => {
      const sut = createWatch({ interval: 1000, lowBelow: 300 })
      const listener = vi.fn()
      sut.on('low', listener)

      await vi.advanceTimersByTimeAsync(0)
      reader.read.mockResolvedValue(spaceWith(700))
      await vi.advanceTimersByTimeAsync(1000)
      expect(listener).not.toHaveBeenCalled()

      reader.read.mockResolvedValue(spaceWith(701))
      await vi.advanceTimersByTimeAsync(1000)
      reader.read.mockResolvedValue(spaceWith(800))
      await vi.advanceTimersByTimeAsync(1000)

      expect(listener).toHaveBeenCalledExactlyOnceWith(spaceWith(701))
    })

    test('should report again after the space had recovered', async () => {
      const sut = createWatch({ interval: 1000, lowBelow: 300 })
      const listener = vi.fn()
      sut.on('low', listener)

      for (const usage of [800, 100, 900]) {
        reader.read.mockResolvedValue(spaceWith(usage))
        await vi.advanceTimersByTimeAsync(1000)
      }

      expect(listener.mock.calls).toEqual([[spaceWith(800)], [spaceWith(900)]])
    })

    test('should report if the space is already low on the first read', async () => {
      reader.read.mockResolvedValue(spaceWith(900))
      const sut = createWatch({ lowBelow: 300 })
      const listener = vi.fn()
      sut.on('low', listener)

      await vi.advanceTimersByTimeAsync(0)

      expect(listener).toHaveBeenCalledExactlyOnceWith(spaceWith(900))
    })

    test('should not report without a limit or for an unknown space', async () => {
      reader.read.mockResolvedValue(spaceWith(1000))
      const withoutLimit = createWatch()
      const listener = vi.fn()
      withoutLimit.on('low', listener)
      await vi.advanceTimersByTimeAsync(0)

      reader.read.mockResolvedValue(StorageSpace.unknown())
      const unknown = createWatch({ lowBelow: 300 })
      unknown.on('low', listener)
      await vi.advanceTimersByTimeAsync(0)

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('#refresh', () => {
    test('should read the space without waiting for the interval', async () => {
      const sut = createWatch({ interval: 60_000 })
      await vi.advanceTimersByTimeAsync(0)
      reader.read.mockResolvedValue(spaceWith(200))

      await sut.refresh()

      expect(sut.current).toEqual(spaceWith(200))
    })

    test('should not start a second read while one is running', async () => {
      const sut = createWatch({ interval: 60_000 })

      await Promise.all([sut.refresh(), sut.refresh()])

      expect(reader.read).toHaveBeenCalledTimes(1)
    })

    test('should read the space when another tab announces a write', async () => {
      let announce!: () => void
      createWatch({ interval: 60_000 }, (listener) => {
        announce = listener

        return new EventSubscription(() => {})
      })
      await vi.advanceTimersByTimeAsync(0)

      announce()
      await vi.advanceTimersByTimeAsync(0)

      expect(reader.read).toHaveBeenCalledTimes(2)
    })
  })

  describe('#stop', () => {
    test('should stop polling and reporting', async () => {
      const unsubscribe = vi.fn()
      const sut = createWatch({ interval: 1000 }, () => new EventSubscription(unsubscribe))
      const listener = vi.fn()
      sut.on('change', listener)
      await vi.advanceTimersByTimeAsync(0)

      sut.stop()
      reader.read.mockResolvedValue(spaceWith(200))
      await vi.advanceTimersByTimeAsync(10_000)

      expect(reader.read).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    test('should say once that it has stopped', async () => {
      const stopped = vi.fn()
      const sut = createWatch({}, undefined, undefined, stopped)
      expect(sut.isActive).toBe(true)

      sut.stop()
      sut.stop()

      expect(sut.isActive).toBe(false)
      expect(stopped).toHaveBeenCalledExactlyOnceWith(sut)
    })

    test('should report a failing listener to the logger instead of failing the read', async () => {
      const logger = mock<Logger>()
      const sut = createWatch({}, undefined, logger)
      sut.on('change', () => {
        throw new Error('listener failed')
      })

      await expect(sut.refresh()).resolves.toBeUndefined()

      expect(logger.error).toHaveBeenCalledTimes(1)
    })

    test('should not report a read that finishes after it has stopped', async () => {
      const sut = createWatch()
      const listener = vi.fn()
      sut.on('change', listener)

      sut.stop()
      await vi.advanceTimersByTimeAsync(0)

      expect(listener).not.toHaveBeenCalled()
      expect(sut.current).toBeUndefined()
    })

    test('should stop at the end of a using block', async () => {
      {
        using sut = createWatch({ interval: 1000 })
        expect(sut.current).toBeUndefined()
      }

      await vi.advanceTimersByTimeAsync(10_000)

      expect(reader.read).toHaveBeenCalledTimes(1)
    })
  })
})
