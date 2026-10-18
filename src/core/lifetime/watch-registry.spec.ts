import { describe, expect, test } from 'vitest'

import { WatchRegistry } from './watch-registry.ts'

class TestWatch {
  public stops = 0

  public constructor(private readonly registry: WatchRegistry<TestWatch>) {}

  public stop(): void {
    this.stops++
    this.registry.forget(this)
  }
}

describe('watch-registry', () => {
  const create = () => {
    const registry: WatchRegistry<TestWatch> = new WatchRegistry((watch) => watch.stop())

    return { registry, watch: () => registry.track(new TestWatch(registry)) }
  }

  test('should end every watch that still runs, once', async () => {
    const { registry, watch } = create()
    const first = watch()
    const second = watch()

    registry.endAll()
    registry.endAll()

    expect(first.stops).toBe(1)
    expect(second.stops).toBe(1)
  })

  test('should not end a watch that ended before', async () => {
    const { registry, watch } = create()
    const stopped = watch()
    stopped.stop()

    registry.endAll()

    expect(stopped.stops).toBe(1)
  })

  test('should return the watch it tracks', async () => {
    const { registry } = create()
    const watch = new TestWatch(registry)

    expect(registry.track(watch)).toBe(watch)
  })
})
