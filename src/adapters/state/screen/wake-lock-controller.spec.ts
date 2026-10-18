import { describe, expect, test } from 'vitest'

import type { ScreenWakeLock } from '../../../screen/wake-lock/screen-wake-lock.ts'
import type { WakeLockHold } from '../../../screen/wake-lock/wake-lock-hold.ts'
import { WakeLockController } from './wake-lock-controller.ts'

describe('wake-lock-controller', () => {
  const create = () => {
    const holds: { released: boolean }[] = []
    let grant: () => void = () => undefined

    const wakeLock = {
      request: () =>
        new Promise<WakeLockHold>((resolve) => {
          grant = () => {
            const hold = { released: false, release: () => (hold.released = true) }
            holds.push(hold)
            resolve(hold as unknown as WakeLockHold)
          }
        }),
    } as unknown as ScreenWakeLock

    return { holds, grant: () => grant(), sut: new WakeLockController(() => wakeLock) }
  }

  test('should hold the wake lock until it is released', async () => {
    const { holds, grant, sut } = create()

    const requesting = sut.request()
    grant()
    await requesting
    expect(sut.read().isRequested).toBe(true)

    sut.release()
    expect(sut.read().isRequested).toBe(false)
    expect(holds[0]?.released).toBe(true)
  })

  test('should give back a hold that arrives after the component went away', async () => {
    const { holds, grant, sut } = create()

    const requesting = sut.request()
    sut.deactivate()
    grant()
    await requesting

    expect(sut.read().isRequested).toBe(false)
    expect(holds[0]?.released).toBe(true)
  })
})
