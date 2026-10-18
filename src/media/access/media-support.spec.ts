import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { MediaSupport } from './media-support.ts'

describe('media-support', () => {
  // SAFETY: the support only checks that the call is there
  const mediaDevices = { getUserMedia: () => Promise.reject(new Error('not opened')) } as unknown as MediaDevices
  const navigator = { mediaDevices } as Navigator

  test('should hand out the media devices on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ navigator })

    expect(MediaSupport.isSupportedIn(environment)).toBe(true)
    expect(MediaSupport.resolveFor(environment)).toBe(mediaDevices)
  })

  test('should not be supported outside a secure context', async () => {
    const environment = BrowserEnvironment.of({ navigator, isSecureContext: false })

    expect(MediaSupport.isSupportedIn(environment)).toBe(false)
    expect(MediaSupport.resolveFor(environment)).toBeUndefined()
  })

  test('should not be supported without getUserMedia', async () => {
    expect(MediaSupport.isSupportedIn(BrowserEnvironment.of({ navigator: { mediaDevices: {} } as Navigator }))).toBe(
      false
    )
    expect(MediaSupport.isSupportedIn(BrowserEnvironment.of({ navigator: {} as Navigator }))).toBe(false)
  })
})
