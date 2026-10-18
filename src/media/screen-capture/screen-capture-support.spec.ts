import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { ScreenCaptureSupport } from './screen-capture-support.ts'

describe('screen-capture-support', () => {
  // SAFETY: the support only checks that the call is there
  const navigator = {
    mediaDevices: { getDisplayMedia: () => Promise.reject(new Error('not captured')) },
  } as unknown as Navigator

  test('should hand out the capture on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ navigator })

    expect(ScreenCaptureSupport.isSupportedIn(environment)).toBe(true)
    expect(ScreenCaptureSupport.resolveFor(environment)).toBeTypeOf('function')
  })

  test('should not be supported outside a secure context', async () => {
    const environment = BrowserEnvironment.of({ navigator, isSecureContext: false })

    expect(ScreenCaptureSupport.isSupportedIn(environment)).toBe(false)
    expect(ScreenCaptureSupport.resolveFor(environment)).toBeUndefined()
  })

  test('should not be supported where the browser cannot capture the screen', async () => {
    const environment = BrowserEnvironment.of({ navigator: { mediaDevices: {} } as Navigator })

    expect(ScreenCaptureSupport.isSupportedIn(environment)).toBe(false)
  })
})
