import { describe, expect, test } from 'vitest'

import { EventEmitter } from '../../../core/events/event-emitter.ts'
import type { Store } from '../../../storage/store/store.ts'
import { StoredValueController } from './stored-value-controller.ts'

class FakeStore extends EventEmitter<{ change: { key: string } }> {
  public readonly reads: ((value: number | undefined) => void)[] = []

  public get(): Promise<number | undefined> {
    return new Promise((resolve) => this.reads.push(resolve))
  }

  public announce(key: string): void {
    this.emit('change', { key })
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve))

describe('stored-value-controller', () => {
  test('should drop a read that a later one overtook', async () => {
    const store = new FakeStore()
    const sut = new StoredValueController<number>()

    sut.select(store as unknown as Store<number>, 'count')
    store.announce('count')
    store.reads[1]?.(2)
    await flush()
    store.reads[0]?.(1)
    await flush()

    expect(sut.read()).toMatchObject({ value: 2, isLoaded: true })
  })

  test('should follow only the entry it shows', async () => {
    const store = new FakeStore()
    const sut = new StoredValueController<number>()

    sut.select(store as unknown as Store<number>, 'count')
    store.announce('other')

    expect(store.reads).toHaveLength(1)
  })

  test('should drop what arrives after the component went away and stop following', async () => {
    const store = new FakeStore()
    const sut = new StoredValueController<number>()

    sut.select(store as unknown as Store<number>, 'count')
    sut.deactivate()
    store.reads[0]?.(1)
    store.announce('count')
    await flush()

    expect(sut.read()).toMatchObject({ value: undefined, isLoaded: false })
    expect(store.reads).toHaveLength(1)
  })
})
