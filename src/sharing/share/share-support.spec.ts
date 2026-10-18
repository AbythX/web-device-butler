import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { ShareSupport } from './share-support.ts'

describe('share-support', () => {
  // SAFETY: the support only checks that the call is there
  const navigator = { share: () => Promise.resolve() } as unknown as Navigator

  test('should hand out the share sheet on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ navigator })

    expect(ShareSupport.isSupportedIn(environment)).toBe(true)
    expect(ShareSupport.resolveFor(environment)).toBe(navigator)
  })

  test('should not be supported outside a secure context', async () => {
    const environment = BrowserEnvironment.of({ navigator, isSecureContext: false })

    expect(ShareSupport.isSupportedIn(environment)).toBe(false)
    expect(ShareSupport.resolveFor(environment)).toBeUndefined()
  })

  test('should not be supported without a share sheet', async () => {
    expect(ShareSupport.isSupportedIn(BrowserEnvironment.of({ navigator: {} as Navigator }))).toBe(false)
  })
})
