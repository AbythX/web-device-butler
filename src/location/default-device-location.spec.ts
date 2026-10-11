import { beforeEach, describe, expect, test } from 'vitest'

import { DeviceEnvironment } from '../core/environment/device-environment.ts'
import type { DeviceError } from '../core/errors/device-error.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import { PermissionDeniedError } from '../permission/errors/permission-denied-error.ts'
import { DefaultDeviceLocation } from './default-device-location.ts'
import type { DeviceLocation } from './device-location.ts'
import { DevicePosition } from './device-position.ts'
import { LocationError } from './errors/location-error.ts'
import { LocationTimeoutError } from './errors/location-timeout-error.ts'
import { LocationUnavailableError } from './errors/location-unavailable-error.ts'
import { FakeGeolocation } from './testing/fake-geolocation.ts'

const berlin = { latitude: 52.52, longitude: 13.405 }

const hamburg = { latitude: 53.5511, longitude: 9.9937 }

describe('default-device-location', () => {
  let geolocation!: FakeGeolocation
  let sut!: DeviceLocation

  const locationOf = (globals: object) => new DefaultDeviceLocation(DeviceEnvironment.of(globals), new NullLogger())

  beforeEach(() => {
    geolocation = new FakeGeolocation()
    sut = locationOf({ navigator: { geolocation } })
  })

  describe('#isSupported', () => {
    test('should be true where the browser has a location', async () => {
      expect(sut.isSupported).toBe(true)
    })

    test.each([
      ['there is no browser', {}],
      ['the browser has no location', { navigator: {} }],
      [
        'the page was not loaded over HTTPS',
        { navigator: { geolocation: new FakeGeolocation() }, isSecureContext: false },
      ],
    ])('should be false where %s', async (_name, globals) => {
      expect(locationOf(globals).isSupported).toBe(false)
    })
  })

  describe('construction', () => {
    test('should ask the browser nothing', async () => {
      expect(geolocation.calls).toEqual([])
    })
  })

  describe('#current', () => {
    test('should resolve with the position of the device', async () => {
      const locating = sut.current()
      geolocation.moveTo({ ...berlin, accuracy: 12 }, 1234)

      const position = await locating

      expect(position).toBeInstanceOf(DevicePosition)
      expect(position).toMatchObject({ ...berlin, accuracy: 12, timestamp: 1234 })
    })

    test('should leave out what the device cannot tell', async () => {
      const locating = sut.current()
      geolocation.moveTo({ ...berlin, altitude: null, heading: Number.NaN, speed: 3 })

      const position = await locating

      expect(position.altitude).toBeUndefined()
      expect(position.heading).toBeUndefined()
      expect(position.speed).toBe(3)
    })

    test('should ask once and not keep watching', async () => {
      const locating = sut.current()
      geolocation.moveTo(berlin)
      await locating

      expect(geolocation.calls).toHaveLength(1)
      expect(geolocation.watches.size).toBe(0)
    })

    test('should pass the options on to the browser', async () => {
      void sut.current({ highAccuracy: true, timeout: 5000, maximumAge: 60_000 }).catch(() => undefined)

      expect(geolocation.calls).toEqual([{ enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 }])
    })

    test.each([
      [FakeGeolocation.permissionDenied, PermissionDeniedError],
      [FakeGeolocation.positionUnavailable, LocationUnavailableError],
      [FakeGeolocation.timeout, LocationTimeoutError],
      [99, LocationError],
    ])('should turn the code %d of the browser into an error of the library', async (code, expected) => {
      const locating = sut.current()
      geolocation.fail(code)

      const error = await locating.catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(expected)
      expect((error as Error).cause).toMatchObject({ code })
    })

    test('should name the permission that was refused', async () => {
      const locating = sut.current()
      geolocation.fail(FakeGeolocation.permissionDenied)

      await expect(locating).rejects.toMatchObject({ name: 'PermissionDeniedError', permission: 'geolocation' })
    })

    test('should reject where the browser has no location', async () => {
      await expect(locationOf({}).current()).rejects.toThrow(UnsupportedError)
    })

    test('should stop waiting when the call is aborted', async () => {
      const controller = new AbortController()
      const reason = new Error('the user left')
      const locating = sut.current({ signal: controller.signal })

      controller.abort(reason)

      await expect(locating).rejects.toBe(reason)
      // the answer of the browser arrives anyway and is ignored
      expect(() => geolocation.moveTo(berlin)).not.toThrow()
    })

    test('should not ask the browser for a call that was aborted before', async () => {
      const reason = new Error('too late')

      await expect(sut.current({ signal: AbortSignal.abort(reason) })).rejects.toBe(reason)
      expect(geolocation.calls).toEqual([])
    })
  })

  describe('#watch', () => {
    test('should report every position of the device', async () => {
      const watch = sut.watch()
      const positions: DevicePosition[] = []
      watch.on('position', (position) => positions.push(position))

      geolocation.moveTo(berlin)
      geolocation.moveTo(hamburg)

      expect(positions.map(({ latitude }) => latitude)).toEqual([berlin.latitude, hamburg.latitude])
      expect(watch.position).toBe(positions[1])
    })

    test('should have no position before the first one arrived', async () => {
      const watch = sut.watch()

      expect(watch.position).toBeUndefined()
      expect(watch.isActive).toBe(true)
    })

    test('should pass the options on to the browser', async () => {
      sut.watch({ highAccuracy: true, maximumAge: 1000 })

      expect(geolocation.calls).toEqual([{ enableHighAccuracy: true, timeout: undefined, maximumAge: 1000 }])
    })

    test('should report a problem and keep watching', async () => {
      const watch = sut.watch()
      const errors: DeviceError[] = []
      const positions: DevicePosition[] = []
      watch.on('error', (error) => errors.push(error))
      watch.on('position', (position) => positions.push(position))

      geolocation.fail(FakeGeolocation.positionUnavailable)
      geolocation.fail(FakeGeolocation.timeout)
      geolocation.moveTo(berlin)

      expect(errors.map((error) => error.name)).toEqual(['LocationUnavailableError', 'LocationTimeoutError'])
      expect(positions).toHaveLength(1)
      expect(watch.isActive).toBe(true)
    })

    test('should report a refused permission and stop, because nothing arrives after it', async () => {
      const watch = sut.watch()
      const errors: DeviceError[] = []
      watch.on('error', (error) => errors.push(error))

      geolocation.fail(FakeGeolocation.permissionDenied)

      expect(errors).toHaveLength(1)
      expect(errors[0]).toBeInstanceOf(PermissionDeniedError)
      expect(watch.isActive).toBe(false)
      expect(geolocation.watches.size).toBe(0)
    })

    test('should stop following the device', async () => {
      const watch = sut.watch()
      const positions: DevicePosition[] = []
      watch.on('position', (position) => positions.push(position))

      watch.stop()
      watch.stop()
      geolocation.moveTo(berlin)

      expect(watch.isActive).toBe(false)
      expect(geolocation.watches.size).toBe(0)
      expect(positions).toEqual([])
    })

    test('should keep the last position after it was stopped', async () => {
      const watch = sut.watch()
      geolocation.moveTo(berlin)

      watch.stop()

      expect(watch.position?.latitude).toBe(berlin.latitude)
    })

    test('should be stopped at the end of a using block', async () => {
      {
        using watch = sut.watch()
        expect(watch.isActive).toBe(true)
      }

      expect(geolocation.watches.size).toBe(0)
    })

    test('should run several watches next to each other', async () => {
      const first = sut.watch()
      const second = sut.watch({ highAccuracy: true })

      first.stop()
      geolocation.moveTo(berlin)

      expect(first.position).toBeUndefined()
      expect(second.position?.latitude).toBe(berlin.latitude)
    })

    test('should throw where the browser has no location', async () => {
      expect(() => locationOf({}).watch()).toThrow(UnsupportedError)
    })
  })

  describe('#dispose', () => {
    test('should stop every watch', async () => {
      const first = sut.watch()
      const second = sut.watch()

      sut.dispose()

      expect(first.isActive).toBe(false)
      expect(second.isActive).toBe(false)
      expect(geolocation.watches.size).toBe(0)
    })
  })

  describe('.create', () => {
    test('should build a location that works on its own', async () => {
      const location = DefaultDeviceLocation.create(
        DeviceEnvironment.of({ navigator: { geolocation } as unknown as Navigator })
      )

      const locating = location.current()
      geolocation.moveTo(berlin)

      expect((await locating).longitude).toBe(berlin.longitude)
    })
  })
})
