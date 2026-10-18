import { describe, expect, test, vi } from 'vitest'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { OrientationLockSupport } from './orientation-lock-support.ts'

describe('orientation-lock-support', () => {
  // SAFETY: the support only reads `screen.orientation`
  const windowWith = (orientation: object) => ({ screen: { orientation } }) as unknown as Window

  test('should hand out the lock, also outside a secure context', async () => {
    const orientation = { lock: vi.fn(() => Promise.resolve()) }
    const environment = BrowserEnvironment.of({ window: windowWith(orientation), isSecureContext: false })

    expect(OrientationLockSupport.canLockIn(environment)).toBe(true)
    await OrientationLockSupport.resolveFor(environment)?.lock('portrait')
    expect(orientation.lock).toHaveBeenCalledWith('portrait')
  })

  test('should call the lock on the orientation of the screen', async () => {
    const orientation = {
      lock(this: unknown) {
        return this === orientation ? Promise.resolve() : Promise.reject(new TypeError('Illegal invocation'))
      },
    }

    const environment = BrowserEnvironment.of({ window: windowWith(orientation) })

    await expect(OrientationLockSupport.resolveFor(environment)?.lock('landscape')).resolves.toBeUndefined()
  })

  test('should not lock where the browser has no call for it', async () => {
    const environment = BrowserEnvironment.of({ window: windowWith({}) })

    expect(OrientationLockSupport.canLockIn(environment)).toBe(false)
    expect(OrientationLockSupport.resolveFor(environment)).toBeUndefined()
    expect(OrientationLockSupport.canLockIn(BrowserEnvironment.of({}))).toBe(false)
  })
})
