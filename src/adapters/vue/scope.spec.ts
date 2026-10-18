import { describe, expect, test, vi } from 'vitest'
import { effectScope } from 'vue'

import { EventEmitter } from '../../core/events/event-emitter.ts'
import { onScopeEnd, untilScopeEnd } from './scope.ts'

class Ticker extends EventEmitter<{ tick: number }> {
  public tick(value: number): void {
    this.emit('tick', value)
  }
}

describe('scope', () => {
  describe('onScopeEnd', () => {
    test('should clean up when the scope ends', async () => {
      const cleanup = vi.fn<() => void>()
      const scope = effectScope()

      scope.run(() => onScopeEnd(cleanup))
      expect(cleanup).not.toHaveBeenCalled()

      scope.stop()
      expect(cleanup).toHaveBeenCalledOnce()
    })

    test('should do nothing outside a scope', async () => {
      const cleanup = vi.fn<() => void>()

      expect(() => onScopeEnd(cleanup)).not.toThrow()
      expect(cleanup).not.toHaveBeenCalled()
    })
  })

  describe('untilScopeEnd', () => {
    test('should listen until the scope ends', async () => {
      const ticker = new Ticker()
      const listener = vi.fn<(value: number) => void>()
      const scope = effectScope()

      scope.run(() => untilScopeEnd(ticker.on('tick', listener)))
      ticker.tick(1)
      scope.stop()
      ticker.tick(2)

      expect(listener.mock.calls).toEqual([[1]])
    })

    test('should keep listening outside a scope', async () => {
      const ticker = new Ticker()
      const listener = vi.fn<(value: number) => void>()

      untilScopeEnd(ticker.on('tick', listener))
      ticker.tick(1)

      expect(listener).toHaveBeenCalledWith(1)
    })
  })
})
