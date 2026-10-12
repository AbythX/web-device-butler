import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { DefaultDeviceLocation } from '../../../location/default-device-location.ts'
import { FakeGeolocation } from '../../../location/testing/fake-geolocation.ts'
import { renderHook } from '../testing/render-hook.ts'
import { useLocation } from './use-location.ts'

describe('useLocation', () => {
  test('should follow the device from start to stop', async () => {
    const geolocation = new FakeGeolocation()

    const location = new DefaultDeviceLocation(
      BrowserEnvironment.of({ navigator: { geolocation } } as object),
      new NullLogger()
    )

    const hook = await renderHook(() => useLocation(location))
    expect(hook.result.current.isWatching).toBe(false)
    expect(geolocation.watches.size).toBe(0)

    await hook.act(() => hook.result.current.start())
    await hook.act(() => geolocation.moveTo({ latitude: 52.5, longitude: 13.4 }))

    expect(hook.result.current.isWatching).toBe(true)
    expect(hook.result.current.position?.latitude).toBe(52.5)

    await hook.unmount()
    expect(geolocation.watches.size).toBe(0)
  })
})
