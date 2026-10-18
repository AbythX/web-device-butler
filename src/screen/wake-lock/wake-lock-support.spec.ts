import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { WakeLockSupport } from './wake-lock-support.ts'

describe('wake-lock-support', () => {
  const wakeLock = {} as WakeLock
  const navigator = { wakeLock } as Navigator

  test('should hand out the wake lock on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ navigator })

    expect(WakeLockSupport.isSupportedIn(environment)).toBe(true)
    expect(WakeLockSupport.resolveFor(environment)).toBe(wakeLock)
  })

  test('should not be supported outside a secure context', async () => {
    const environment = BrowserEnvironment.of({ navigator, isSecureContext: false })

    expect(WakeLockSupport.isSupportedIn(environment)).toBe(false)
    expect(WakeLockSupport.resolveFor(environment)).toBeUndefined()
  })

  test('should not be supported where the browser cannot keep the screen on', async () => {
    expect(WakeLockSupport.isSupportedIn(BrowserEnvironment.of({ navigator: {} as Navigator }))).toBe(false)
  })
})
