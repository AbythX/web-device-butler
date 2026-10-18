import { describe, expect, test } from 'vitest'

import { BrowserEnvironment, type BrowserGlobals } from '../../core/environment/browser-environment.ts'
import type { SensorEventFactory } from '../../core/environment/sensor-events-like.ts'
import { MotionPermissionRequester } from './motion-permission-requester.ts'

/** the events of Safari on iOS, which ask the user */
const asking = (answer: 'granted' | 'denied' | Error): SensorEventFactory => ({
  prototype: {},
  requestPermission: () => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)),
})

const silent: SensorEventFactory = { prototype: {} }

/** a page to listen on, which the sensors need */
const page = { window: {} as Window, document: {} as Document }

const requesterOf = (globals: Partial<BrowserGlobals>) =>
  new MotionPermissionRequester(BrowserEnvironment.of({ ...page, ...globals }))

/** what Chromium answers for its sensors */
const permissions = (state: PermissionState | Error) =>
  ({
    permissions: {
      query: () => (state instanceof Error ? Promise.reject(state) : Promise.resolve({ state })),
    },
  }) as unknown as Navigator

describe('motion-permission-requester', () => {
  test('should be supported where the browser has the events, on a page over HTTPS', () => {
    expect(requesterOf({ DeviceOrientationEvent: silent }).isSupported).toBe(true)
    expect(requesterOf({}).isSupported).toBe(false)
    expect(requesterOf({ DeviceOrientationEvent: silent, isSecureContext: false }).isSupported).toBe(false)
  })

  test('should not be supported without a page, as the sensors cannot be listened to', () => {
    expect(requesterOf({ DeviceOrientationEvent: silent, window: undefined, document: undefined }).isSupported).toBe(
      false
    )
  })

  describe('in Safari on iOS', () => {
    test('should ask for both sensors and report what the user answered', async () => {
      const sut = requesterOf({ DeviceOrientationEvent: asking('granted'), DeviceMotionEvent: asking('granted') })

      expect(await sut.query()).toBe('prompt')
      expect(await sut.request()).toBe('granted')
      expect(await sut.query()).toBe('granted')
    })

    test('should count a refusal of one sensor as a refusal', async () => {
      const sut = requesterOf({ DeviceOrientationEvent: asking('granted'), DeviceMotionEvent: asking('denied') })

      expect(await sut.request()).toBe('denied')
    })

    test('should leave the state to the query where Safari did not ask, outside a click', async () => {
      const sut = requesterOf({ DeviceOrientationEvent: asking(new DOMException('No gesture', 'NotAllowedError')) })

      expect(await sut.request()).toBeUndefined()
      expect(await sut.query()).toBe('prompt')
    })
  })

  describe('elsewhere', () => {
    test('should not ask, and read what Chromium says about its sensors', async () => {
      const sut = requesterOf({ DeviceOrientationEvent: silent, navigator: permissions('granted') })

      expect(await sut.request()).toBeUndefined()
      expect(await sut.query()).toBe('granted')
    })

    test('should report sensors that Chromium refuses', async () => {
      expect(await requesterOf({ DeviceOrientationEvent: silent, navigator: permissions('denied') }).query()).toBe(
        'denied'
      )
    })

    test('should take a browser that does not know the sensors as permissions for one that does not ask', async () => {
      const unknown = new TypeError('Unknown permission name')

      expect(await requesterOf({ DeviceOrientationEvent: silent, navigator: permissions(unknown) }).query()).toBe(
        'granted'
      )
      expect(await requesterOf({ DeviceOrientationEvent: silent }).query()).toBe('granted')
    })
  })
})
