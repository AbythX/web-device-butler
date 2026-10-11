import { describe, expect, test } from 'vitest'

import { DeviceEnvironment } from '../../core/environment/device-environment.ts'
import { DefaultDevicePlatform } from '../../platform/default-device-platform.ts'
import { PlatformQuirks } from './platform-quirks.ts'

const platformOf = (navigator: Partial<Navigator>) =>
  new DefaultDevicePlatform(DeviceEnvironment.of({ navigator: navigator as Navigator }))

describe('platform-quirks', () => {
  describe('.for', () => {
    test('should compose a camera session on iOS with the torch workaround', async () => {
      const quirks = PlatformQuirks.for(platformOf({ platform: 'iPhone' }), 'camera')

      expect(quirks.map((quirk) => quirk.name)).toEqual(['ios-torch-resets-on-zoom'])
    })

    test('should give every session its own quirks', async () => {
      const platform = platformOf({ platform: 'iPhone' })

      expect(PlatformQuirks.for(platform, 'camera')[0]).not.toBe(PlatformQuirks.for(platform, 'camera')[0])
    })

    test.each([
      ['a microphone on iOS', { platform: 'iPhone' }, 'microphone' as const],
      ['a camera on Android', { platform: 'Linux armv8l', userAgent: 'Android 14' }, 'camera' as const],
      ['a camera on a desktop', { platform: 'Win32' }, 'camera' as const],
    ])('should need nothing for %s', async (_name, navigator, kind) => {
      expect(PlatformQuirks.for(platformOf(navigator), kind)).toEqual([])
    })
  })
})
