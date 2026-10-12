import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { DefaultDeviceLocation } from '../../../location/default-device-location.ts'
import type { DeviceLocation } from '../../../location/device-location.ts'
import { FakeGeolocation } from '../../../location/testing/fake-geolocation.ts'
import { useLocation } from './use-location.ts'

describe('use-location', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  let geolocation!: FakeGeolocation
  let location!: DeviceLocation

  beforeEach(() => {
    geolocation = new FakeGeolocation()
    location = new DefaultDeviceLocation(
      BrowserEnvironment.of({ navigator: { geolocation } as unknown as Navigator }),
      new NullLogger()
    )
  })

  test('should ask the browser nothing before it is started', async () => {
    const state = within(() => useLocation(location))

    expect(state.isWatching.value).toBe(false)
    expect(geolocation.calls).toEqual([])
  })

  test('should follow the position of the device', async () => {
    const state = within(() => useLocation(location))

    state.start({ highAccuracy: true })
    geolocation.moveTo({ latitude: 52.52, longitude: 13.405 })

    expect(state.isWatching.value).toBe(true)
    expect(state.position.value).toMatchObject({ latitude: 52.52, longitude: 13.405 })
    expect(geolocation.calls[0]).toMatchObject({ enableHighAccuracy: true })
  })

  test('should expose a problem and clear it with the next position', async () => {
    const state = within(() => useLocation(location))
    state.start()

    geolocation.fail(FakeGeolocation.timeout)
    expect((state.error.value as Error).name).toBe('LocationTimeoutError')
    expect(state.isWatching.value).toBe(true)

    geolocation.moveTo({ latitude: 1, longitude: 2 })
    expect(state.error.value).toBeUndefined()
  })

  test('should stop watching when the permission is refused', async () => {
    const state = within(() => useLocation(location))
    state.start()

    geolocation.fail(FakeGeolocation.permissionDenied)

    expect((state.error.value as Error).name).toBe('PermissionDeniedError')
    expect(state.isWatching.value).toBe(false)
  })

  test('should expose that the browser has no location', async () => {
    const state = within(() => useLocation(new DefaultDeviceLocation(BrowserEnvironment.of({}), new NullLogger())))

    state.start()

    expect((state.error.value as Error).name).toBe('UnsupportedError')
    expect(state.isWatching.value).toBe(false)
  })

  test('should stop, and stop when the component is unmounted', async () => {
    const state = within(() => useLocation(location))
    state.start()

    state.stop()
    expect(geolocation.watches.size).toBe(0)
    expect(state.isWatching.value).toBe(false)

    state.start()
    scope.stop()
    expect(geolocation.watches.size).toBe(0)
  })

  test('should run only one watch when it is started twice', async () => {
    const state = within(() => useLocation(location))

    state.start()
    state.start()

    expect(geolocation.watches.size).toBe(1)
  })
})
