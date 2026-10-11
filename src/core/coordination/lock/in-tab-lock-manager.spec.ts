import { beforeEach, describe, expect, test, vi } from 'vitest'

import { InTabLockManager } from './in-tab-lock-manager.ts'
import type { LockLike, LockMode } from './lock-manager-like.ts'

/**
 * A request whose lock stays held until the spec releases it.
 */
class HeldRequest {
  public isGranted = false
  public lock: LockLike | null | undefined
  public release!: () => void
  public readonly settled: Promise<unknown>

  public constructor(manager: InTabLockManager, name: string, mode: LockMode, signal?: AbortSignal) {
    this.settled = manager.request(name, { mode, signal }, (lock) => {
      this.isGranted = true
      this.lock = lock

      return new Promise<void>((resolve) => {
        this.release = resolve
      })
    })
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

describe('in-tab-lock-manager', () => {
  let sut!: InTabLockManager

  beforeEach(() => {
    sut = new InTabLockManager()
  })

  test('should grant a free lock and pass its name and mode', async () => {
    const request = new HeldRequest(sut, 'camera', 'exclusive')
    await flush()

    expect(request.isGranted).toBe(true)
    expect(request.lock).toEqual({ name: 'camera', mode: 'exclusive' })
  })

  test('should keep nothing for a name once nobody holds or waits for it', async () => {
    const abort = new AbortController()
    const holder = new HeldRequest(sut, 'camera', 'exclusive')
    const waiting = sut.request('camera', { signal: abort.signal }, async () => undefined)
    await flush()

    abort.abort(new Error('aborted'))
    await expect(waiting).rejects.toThrowError('aborted')
    holder.release()
    await flush()

    expect(Reflect.get(sut, 'held')).toEqual(new Map())
    expect(Reflect.get(sut, 'pending')).toEqual(new Map())
  })

  test('should default to an exclusive lock', async () => {
    let granted: LockLike | null = null
    await sut.request('camera', {}, async (lock) => {
      granted = lock
    })

    expect(granted).toEqual({ name: 'camera', mode: 'exclusive' })
  })

  test('should resolve once the callback has settled', async () => {
    const request = new HeldRequest(sut, 'camera', 'exclusive')
    const settled = vi.fn()
    void request.settled.then(settled)
    await flush()

    expect(settled).not.toHaveBeenCalled()

    request.release()
    await flush()

    expect(settled).toHaveBeenCalled()
  })

  test('should release the lock and reject if the callback fails', async () => {
    const error = new Error('callback failed')

    await expect(sut.request('camera', {}, () => Promise.reject(error))).rejects.toThrowError(error)

    const next = new HeldRequest(sut, 'camera', 'exclusive')
    await flush()
    expect(next.isGranted).toBe(true)
  })

  test('should make a second exclusive request wait until the first is released', async () => {
    const first = new HeldRequest(sut, 'camera', 'exclusive')
    const second = new HeldRequest(sut, 'camera', 'exclusive')
    await flush()

    expect(first.isGranted).toBe(true)
    expect(second.isGranted).toBe(false)

    first.release()
    await flush()

    expect(second.isGranted).toBe(true)
  })

  test('should grant waiting requests in the order they were made', async () => {
    const order: number[] = []

    const requests = [1, 2, 3].map((index) =>
      sut.request('camera', {}, async () => {
        order.push(index)
      })
    )

    await Promise.all(requests)

    expect(order).toEqual([1, 2, 3])
  })

  test('should not let locks with different names wait for each other', async () => {
    const camera = new HeldRequest(sut, 'camera', 'exclusive')
    const microphone = new HeldRequest(sut, 'microphone', 'exclusive')
    await flush()

    expect(camera.isGranted).toBe(true)
    expect(microphone.isGranted).toBe(true)
  })

  test('should grant several shared requests at once', async () => {
    const first = new HeldRequest(sut, 'microphone', 'shared')
    const second = new HeldRequest(sut, 'microphone', 'shared')
    await flush()

    expect(first.isGranted).toBe(true)
    expect(second.isGranted).toBe(true)
  })

  test('should make an exclusive request wait until every shared lock is released', async () => {
    const first = new HeldRequest(sut, 'microphone', 'shared')
    const second = new HeldRequest(sut, 'microphone', 'shared')
    const exclusive = new HeldRequest(sut, 'microphone', 'exclusive')
    await flush()

    first.release()
    await flush()
    expect(exclusive.isGranted).toBe(false)

    second.release()
    await flush()
    expect(exclusive.isGranted).toBe(true)
  })

  test('should not let a shared request overtake a waiting exclusive request', async () => {
    const holder = new HeldRequest(sut, 'microphone', 'shared')
    const exclusive = new HeldRequest(sut, 'microphone', 'exclusive')
    const late = new HeldRequest(sut, 'microphone', 'shared')
    await flush()

    expect(late.isGranted).toBe(false)

    holder.release()
    await flush()
    expect(exclusive.isGranted).toBe(true)
    expect(late.isGranted).toBe(false)

    exclusive.release()
    await flush()
    expect(late.isGranted).toBe(true)
  })

  describe('ifAvailable', () => {
    test('should grant a free lock', async () => {
      const callback = vi.fn(async () => {})

      await sut.request('camera', { ifAvailable: true }, callback)

      expect(callback).toHaveBeenCalledExactlyOnceWith({ name: 'camera', mode: 'exclusive' })
    })

    test('should call back without a lock and not wait if the lock is held', async () => {
      const holder = new HeldRequest(sut, 'camera', 'exclusive')
      await flush()
      const callback = vi.fn(async () => {})

      await sut.request('camera', { ifAvailable: true }, callback)

      expect(callback).toHaveBeenCalledExactlyOnceWith(null)
      holder.release()
    })

    test('should call back without a lock if another request is already waiting', async () => {
      const holder = new HeldRequest(sut, 'microphone', 'shared')
      const waiting = new HeldRequest(sut, 'microphone', 'exclusive')
      await flush()
      const callback = vi.fn(async () => {})

      await sut.request('microphone', { mode: 'shared', ifAvailable: true }, callback)

      expect(callback).toHaveBeenCalledExactlyOnceWith(null)
      holder.release()
      await flush()
      waiting.release()
    })
  })

  describe('signal', () => {
    test('should reject without requesting if the signal is already aborted', async () => {
      const reason = new Error('aborted')
      const callback = vi.fn(async () => {})

      await expect(sut.request('camera', { signal: AbortSignal.abort(reason) }, callback)).rejects.toThrowError(reason)
      expect(callback).not.toHaveBeenCalled()
    })

    test('should stop waiting and reject once the signal is aborted', async () => {
      const holder = new HeldRequest(sut, 'camera', 'exclusive')
      const controller = new AbortController()
      const waiting = new HeldRequest(sut, 'camera', 'exclusive', controller.signal)
      await flush()

      const reason = new Error('aborted')
      controller.abort(reason)

      await expect(waiting.settled).rejects.toThrowError(reason)

      holder.release()
      await flush()
      expect(waiting.isGranted).toBe(false)
    })

    test('should grant the requests behind an aborted one', async () => {
      const holder = new HeldRequest(sut, 'microphone', 'shared')
      const controller = new AbortController()
      const exclusive = new HeldRequest(sut, 'microphone', 'exclusive', controller.signal)
      const shared = new HeldRequest(sut, 'microphone', 'shared')
      await flush()
      expect(shared.isGranted).toBe(false)

      controller.abort()
      await expect(exclusive.settled).rejects.toBeDefined()
      await flush()

      expect(shared.isGranted).toBe(true)
      holder.release()
    })

    test('should keep a granted lock if the signal is aborted afterwards', async () => {
      const controller = new AbortController()
      const request = new HeldRequest(sut, 'camera', 'exclusive', controller.signal)
      await flush()

      controller.abort()
      const second = new HeldRequest(sut, 'camera', 'exclusive')
      await flush()

      expect(request.isGranted).toBe(true)
      expect(second.isGranted).toBe(false)
    })
  })

  describe('#query', () => {
    test('should report held and waiting locks', async () => {
      const holder = new HeldRequest(sut, 'camera', 'exclusive')
      const waiting = new HeldRequest(sut, 'camera', 'exclusive')
      const shared = new HeldRequest(sut, 'microphone', 'shared')
      await flush()

      expect(await sut.query()).toEqual({
        held: [
          { name: 'camera', mode: 'exclusive' },
          { name: 'microphone', mode: 'shared' },
        ],
        pending: [{ name: 'camera', mode: 'exclusive' }],
      })

      holder.release()
      await flush()
      waiting.release()
      shared.release()
      await flush()

      expect(await sut.query()).toEqual({ held: [], pending: [] })
    })
  })
})
