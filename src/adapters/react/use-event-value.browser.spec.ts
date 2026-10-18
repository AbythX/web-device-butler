import { describe, expect, test } from 'vitest'

import { EventEmitter } from '../../core/events/event-emitter.ts'
import { renderHook } from './testing/render-hook.ts'
import { useEventValue } from './use-event-value.ts'

class Counter extends EventEmitter<{ change: number }> {
  public count = 0

  public increment(): void {
    this.emit('change', ++this.count)
  }

  public get listening(): number {
    return this.listenerCount('change')
  }
}

describe('useEventValue', () => {
  test('should follow the value and stop listening when unmounted', async () => {
    const counter = new Counter()

    const hook = await renderHook(() => useEventValue(counter, 'change', () => counter.count, -1))
    expect(hook.result.current).toBe(0)
    expect(counter.listening).toBe(1)

    await hook.act(() => counter.increment())
    expect(hook.result.current).toBe(1)

    await hook.unmount()
    expect(counter.listening).toBe(0)
  })
})
