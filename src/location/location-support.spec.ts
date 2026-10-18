import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { LocationSupport } from './location-support.ts'

describe('location-support', () => {
  const geolocation = {} as Geolocation
  const navigator = { geolocation } as Navigator

  test('should hand out the geolocation on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ navigator })

    expect(LocationSupport.isSupportedIn(environment)).toBe(true)
    expect(LocationSupport.resolveFor(environment)).toBe(geolocation)
  })

  test('should not be supported outside a secure context', async () => {
    const environment = BrowserEnvironment.of({ navigator, isSecureContext: false })

    expect(LocationSupport.isSupportedIn(environment)).toBe(false)
    expect(LocationSupport.resolveFor(environment)).toBeUndefined()
  })

  test('should not be supported without a Geolocation API', async () => {
    expect(LocationSupport.isSupportedIn(BrowserEnvironment.of({ navigator: {} as Navigator }))).toBe(false)
  })
})
