import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { VibrationSupport } from './vibration-support.ts'

describe('vibration-support', () => {
  // SAFETY: the support only checks that the call is there
  const navigator = { vibrate: () => true } as unknown as Navigator

  test('should be supported where the browser can vibrate, also outside a secure context', async () => {
    expect(VibrationSupport.isSupportedIn(BrowserEnvironment.of({ navigator }))).toBe(true)
    expect(VibrationSupport.isSupportedIn(BrowserEnvironment.of({ navigator, isSecureContext: false }))).toBe(true)
  })

  test('should not be supported where the browser cannot vibrate', async () => {
    const environment = BrowserEnvironment.of({ navigator: {} as Navigator })

    expect(VibrationSupport.isSupportedIn(environment)).toBe(false)
    expect(VibrationSupport.resolveFor(environment)).toBeUndefined()
  })
})
