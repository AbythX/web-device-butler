import { describe, expect, test } from 'vitest'

import { BrowserEnvironment, type BrowserGlobals } from '../core/environment/browser-environment.ts'
import type { SensorEventFactory } from '../core/environment/sensor-events-like.ts'
import { MotionSupport } from './motion-support.ts'

describe('motion-support', () => {
  const orientation: SensorEventFactory = { prototype: {} }
  const motion: SensorEventFactory = { prototype: {} }
  /** a page to listen on, which the sensors need */
  const page = { window: {} as Window, document: {} as Document }

  const environmentOf = (globals: Partial<BrowserGlobals>) => BrowserEnvironment.of({ ...page, ...globals })

  test('should hand out both events on a page over HTTPS', async () => {
    const environment = environmentOf({ DeviceOrientationEvent: orientation, DeviceMotionEvent: motion })

    expect(MotionSupport.isSupportedIn(environment)).toBe(true)
    expect(MotionSupport.canWatchAttitudeIn(environment)).toBe(true)
    expect(MotionSupport.canWatchMovementIn(environment)).toBe(true)
    expect(MotionSupport.resolveFor(environment)).toEqual([orientation, motion])
  })

  test('should tell the events apart', async () => {
    const environment = environmentOf({ DeviceMotionEvent: motion })

    expect(MotionSupport.isSupportedIn(environment)).toBe(true)
    expect(MotionSupport.canWatchAttitudeIn(environment)).toBe(false)
    expect(MotionSupport.canWatchMovementIn(environment)).toBe(true)
    expect(MotionSupport.resolveFor(environment)).toEqual([motion])
  })

  test.each([
    ['outside a secure context', { isSecureContext: false }],
    ['without a page', { window: undefined, document: undefined }],
  ])('should not be supported %s', async (_, globals) => {
    const environment = environmentOf({ DeviceOrientationEvent: orientation, DeviceMotionEvent: motion, ...globals })

    expect(MotionSupport.isSupportedIn(environment)).toBe(false)
    expect(MotionSupport.canWatchAttitudeIn(environment)).toBe(false)
    expect(MotionSupport.canWatchMovementIn(environment)).toBe(false)
    expect(MotionSupport.resolveFor(environment)).toEqual([])
  })

  test('should not be supported without the events', async () => {
    expect(MotionSupport.isSupportedIn(environmentOf({}))).toBe(false)
  })
})
