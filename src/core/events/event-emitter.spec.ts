import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import type { Logger } from '../logging/logger.ts'
import { EventEmitter } from './event-emitter.ts'

interface TestEvents {
  change: number
  ended: undefined
}

class TestEmitter extends EventEmitter<TestEvents> {
  public readonly firstListener = vi.fn()
  public readonly lastListenerRemoved = vi.fn()

  public fire<Type extends keyof TestEvents>(type: Type, payload: TestEvents[Type]) {
    this.emit(type, payload)
  }

  public fireSafely<Type extends keyof TestEvents>(type: Type, payload: TestEvents[Type], logger: Logger) {
    this.emitSafely(type, payload, logger)
  }

  public count(type: keyof TestEvents) {
    return this.listenerCount(type)
  }

  public clear() {
    this.removeAllListeners()
  }

  protected override onFirstListener(type: keyof TestEvents): void {
    this.firstListener(type)
  }

  protected override onLastListenerRemoved(type: keyof TestEvents): void {
    this.lastListenerRemoved(type)
  }
}

describe('event-emitter', () => {
  let sut!: TestEmitter

  beforeEach(() => {
    sut = new TestEmitter()
  })

  describe('#on', () => {
    test('should call the listener with the payload of its event only', async () => {
      const onChange = vi.fn()
      const onEnded = vi.fn()
      sut.on('change', onChange)
      sut.on('ended', onEnded)

      sut.fire('change', 42)

      expect(onChange).toHaveBeenCalledExactlyOnceWith(42)
      expect(onEnded).not.toHaveBeenCalled()
    })

    test('should call every listener in the order they were added', async () => {
      const calls: string[] = []
      sut.on('change', () => calls.push('first'))
      sut.on('change', () => calls.push('second'))

      sut.fire('change', 1)

      expect(calls).toEqual(['first', 'second'])
    })

    test('should register the same listener only once', async () => {
      const listener = vi.fn()
      sut.on('change', listener)
      sut.on('change', listener)

      sut.fire('change', 1)

      expect(listener).toHaveBeenCalledTimes(1)
    })

    test('should keep a listener that was registered twice until both subscriptions are gone', async () => {
      const listener = vi.fn()
      const first = sut.on('change', listener)
      const second = sut.on('change', listener)

      first.unsubscribe()
      sut.fire('change', 1)
      second.unsubscribe()
      sut.fire('change', 2)

      expect(listener).toHaveBeenCalledExactlyOnceWith(1)
      expect(sut.lastListenerRemoved).toHaveBeenCalledTimes(1)
    })

    test('should stop calling the listener once the subscription is unsubscribed', async () => {
      const listener = vi.fn()
      const subscription = sut.on('change', listener)

      subscription.unsubscribe()
      sut.fire('change', 1)

      expect(listener).not.toHaveBeenCalled()
      expect(subscription.isActive).toBe(false)
    })

    test('should stop calling the listener once the subscription is disposed', async () => {
      const listener = vi.fn()
      {
        using subscription = sut.on('change', listener)
        expect(subscription.isActive).toBe(true)
      }

      sut.fire('change', 1)

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('#once', () => {
    test('should call the listener for the first event only', async () => {
      const listener = vi.fn()
      sut.once('change', listener)

      sut.fire('change', 1)
      sut.fire('change', 2)

      expect(listener).toHaveBeenCalledExactlyOnceWith(1)
      expect(sut.count('change')).toBe(0)
    })

    test('should not call the listener if it was unsubscribed before the event', async () => {
      const listener = vi.fn()
      sut.once('change', listener).unsubscribe()

      sut.fire('change', 1)

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('#off', () => {
    test('should remove the listener', async () => {
      const listener = vi.fn()
      sut.on('change', listener)

      sut.off('change', listener)
      sut.fire('change', 1)

      expect(listener).not.toHaveBeenCalled()
    })

    test('should ignore a listener that was never added', async () => {
      expect(() => sut.off('change', vi.fn())).not.toThrow()
      expect(sut.lastListenerRemoved).not.toHaveBeenCalled()
    })
  })

  describe('#emit', () => {
    test('should do nothing without listeners', async () => {
      expect(() => sut.fire('change', 1)).not.toThrow()
    })

    test('should still call a listener that is removed by an earlier listener of the same event', async () => {
      const second = vi.fn()
      sut.on('change', () => sut.off('change', second))
      sut.on('change', second)

      sut.fire('change', 1)
      sut.fire('change', 2)

      expect(second).toHaveBeenCalledExactlyOnceWith(1)
    })

    test('should call the remaining listeners and rethrow if a listener fails', async () => {
      const error = new Error('listener failed')
      const second = vi.fn()
      sut.on('change', () => {
        throw error
      })
      sut.on('change', second)

      expect(() => sut.fire('change', 1)).toThrowError(error)
      expect(second).toHaveBeenCalledExactlyOnceWith(1)
    })

    test('should rethrow all failures together if several listeners fail', async () => {
      const errors = [new Error('first'), new Error('second')]

      for (const error of errors) {
        sut.on('change', () => {
          throw error
        })
      }

      expect(() => sut.fire('change', 1)).toThrowError(AggregateError)
      expect(() => sut.fire('change', 1)).toThrowError(expect.objectContaining({ errors }))
    })
  })

  describe('#emitSafely', () => {
    test('should call the listeners', async () => {
      const listener = vi.fn()
      sut.on('change', listener)

      sut.fireSafely('change', 1, mock<Logger>())

      expect(listener).toHaveBeenCalledExactlyOnceWith(1)
    })

    test('should report a failing listener to the logger instead of throwing', async () => {
      const logger = mock<Logger>()
      const error = new Error('listener failed')
      const second = vi.fn()
      sut.on('change', () => {
        throw error
      })
      sut.on('change', second)

      expect(() => sut.fireSafely('change', 1, logger)).not.toThrow()

      expect(second).toHaveBeenCalledExactlyOnceWith(1)
      expect(logger.error).toHaveBeenCalledExactlyOnceWith("A listener of 'change' failed", error)
    })
  })

  describe('listener hooks', () => {
    test('should report the first listener of each event once', async () => {
      sut.on('change', vi.fn())
      sut.on('change', vi.fn())
      sut.on('ended', vi.fn())

      expect(sut.firstListener.mock.calls).toEqual([['change'], ['ended']])
    })

    test('should report when the last listener of an event was removed', async () => {
      const first = sut.on('change', vi.fn())
      const second = sut.on('change', vi.fn())

      first.unsubscribe()
      expect(sut.lastListenerRemoved).not.toHaveBeenCalled()

      second.unsubscribe()
      expect(sut.lastListenerRemoved).toHaveBeenCalledExactlyOnceWith('change')
    })

    test('should report the first listener again after all were removed', async () => {
      sut.on('change', vi.fn()).unsubscribe()
      sut.on('change', vi.fn())

      expect(sut.firstListener).toHaveBeenCalledTimes(2)
    })
  })

  describe('#removeAllListeners', () => {
    test('should remove the listeners of every event', async () => {
      const onChange = vi.fn()
      const onEnded = vi.fn()
      sut.on('change', onChange)
      sut.on('ended', onEnded)

      sut.clear()
      sut.fire('change', 1)
      sut.fire('ended', undefined)

      expect(onChange).not.toHaveBeenCalled()
      expect(onEnded).not.toHaveBeenCalled()
      expect(sut.lastListenerRemoved.mock.calls).toEqual([['change'], ['ended']])
    })
  })
})
