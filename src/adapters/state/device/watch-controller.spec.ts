import { describe, expect, test } from 'vitest'

import { EventEmitter } from '../../../core/events/event-emitter.ts'
import type { DeviceLocation } from '../../../location/device-location.ts'
import type { LocationWatch } from '../../../location/location-watch.ts'
import type { MotionWatch } from '../../../motion/watch/motion-watch.ts'
import { LocationController } from './location-controller.ts'
import { MotionController } from './motion-controller.ts'

class FakeWatch extends EventEmitter<Record<string, unknown>> {
  public isActive = true

  public stop(): void {
    this.isActive = false
  }

  public announce(type: string, payload?: unknown): void {
    this.emit(type, payload)
  }
}

describe('location-controller', () => {
  const create = () => {
    const watches: FakeWatch[] = []

    const location = {
      watch: () => {
        const watch = new FakeWatch()
        watches.push(watch)

        return watch as unknown as LocationWatch
      },
    } as unknown as DeviceLocation

    return { watches, sut: new LocationController(() => location) }
  }

  test('should follow the position and clear a problem with the next one', async () => {
    const { watches, sut } = create()

    sut.start()
    watches[0]?.announce('error', new Error('timeout'))
    expect(sut.read()).toMatchObject({ isWatching: true, error: new Error('timeout') })

    watches[0]?.announce('position', { latitude: 1 })
    expect(sut.read()).toMatchObject({ isWatching: true, error: undefined, position: { latitude: 1 } })
  })

  test('should stop watching once the permission is refused', async () => {
    const { watches, sut } = create()

    sut.start()
    watches[0]?.stop()
    watches[0]?.announce('error', new Error('denied'))

    expect(sut.read().isWatching).toBe(false)
  })

  test('should stop the watch before the next one and when the component goes away', async () => {
    const { watches, sut } = create()

    sut.start()
    sut.start()
    expect(watches[0]?.isActive).toBe(false)

    sut.deactivate()
    expect(watches[1]?.isActive).toBe(false)
    expect(sut.read().isWatching).toBe(false)
  })
})

describe('motion-controller', () => {
  test('should follow the values and whether the sensor reports anything', async () => {
    const watch = new FakeWatch()
    const sut = new MotionController<number>(() => () => watch as unknown as MotionWatch<number>)

    sut.start()
    watch.announce('unavailable')
    expect(sut.read()).toMatchObject({ isWatching: true, isAvailable: false, value: undefined })

    watch.announce('change', 3)
    expect(sut.read()).toMatchObject({ isAvailable: true, value: 3 })

    sut.stop()
    expect(sut.read()).toMatchObject({ isWatching: false, value: 3 })
  })

  test('should keep a failure to start instead of throwing it', async () => {
    const failure = new Error('unsupported')

    const sut = new MotionController<number>(() => () => {
      throw failure
    })

    sut.start()

    expect(sut.read()).toMatchObject({ isWatching: false, error: failure })
  })
})
