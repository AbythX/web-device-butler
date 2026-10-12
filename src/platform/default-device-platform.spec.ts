import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { DefaultDevicePlatform } from './default-device-platform.ts'

const platformOf = (navigator: object) =>
  new DefaultDevicePlatform(BrowserEnvironment.of({ navigator: navigator as Navigator }))

const macUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'

describe('default-device-platform', () => {
  describe('#isIos', () => {
    test.each(['iPhone', 'iPad', 'iPod', 'iPhone Simulator', 'iPad Simulator', 'iPod Simulator', 'IPHONE'])(
      'should recognise the platform %s',
      async (platform) => {
        expect(platformOf({ platform }).isIos).toBe(true)
      }
    )

    test('should recognise an iPad that says it is a Mac by its touch screen', async () => {
      expect(platformOf({ platform: 'MacIntel', userAgent: macUserAgent, maxTouchPoints: 5 }).isIos).toBe(true)
    })

    test('should not take a Mac for an iPad', async () => {
      expect(platformOf({ platform: 'MacIntel', userAgent: macUserAgent, maxTouchPoints: 0 }).isIos).toBe(false)
    })

    test('should not take a desktop browser that simulates an iPhone for one', async () => {
      const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'

      expect(platformOf({ platform: 'Win32', userAgent, maxTouchPoints: 5 }).isIos).toBe(false)
    })

    test.each(['Linux armv8l', 'Linux x86_64', 'Win32', ''])(
      'should not recognise the platform "%s"',
      async (platform) => {
        expect(platformOf({ platform, userAgent: 'Mozilla/5.0' }).isIos).toBe(false)
      }
    )

    test('should prefer what the browser says about itself in a structured way', async () => {
      const sut = platformOf({ platform: 'iPhone', userAgentData: { platform: 'Windows' } })

      expect(sut.isIos).toBe(false)
    })

    test('should be false where there is no browser', async () => {
      expect(new DefaultDevicePlatform(BrowserEnvironment.of({})).isIos).toBe(false)
    })
  })

  describe('#isAndroid', () => {
    test('should recognise Android by the structured platform', async () => {
      expect(platformOf({ userAgentData: { platform: 'Android' } }).isAndroid).toBe(true)
    })

    test('should recognise Android by the user agent', async () => {
      const userAgent = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36'

      expect(platformOf({ platform: 'Linux armv8l', userAgent }).isAndroid).toBe(true)
    })

    test.each([
      ['an iPhone', { platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone)' }],
      ['a desktop', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }],
    ])('should not recognise %s', async (_name, navigator) => {
      expect(platformOf(navigator).isAndroid).toBe(false)
    })

    test('should be false where there is no browser', async () => {
      expect(new DefaultDevicePlatform(BrowserEnvironment.of({})).isAndroid).toBe(false)
    })
  })
})
