/**
 * The constructor of `DeviceOrientationEvent` or `DeviceMotionEvent`. Safari on iOS gives it a call that asks the
 * user, which only works in answer to a click; the DOM types do not know it.
 */
export interface SensorEventFactory {
  readonly prototype: object
  requestPermission?(): Promise<'granted' | 'denied'>
}

/**
 * What a `deviceorientation` or `deviceorientationabsolute` event carries, in degrees. The values are `null` where the
 * device has no sensor for them; Safari adds the heading of its compass.
 */
export interface OrientationReadingLike {
  readonly alpha: number | null
  readonly beta: number | null
  readonly gamma: number | null
  /** whether `alpha` is measured from north, not from wherever the device pointed when the page began to listen */
  readonly absolute?: boolean
  /** Safari: degrees clockwise from magnetic north */
  readonly webkitCompassHeading?: number
  /** Safari: how far off the heading may be, in degrees; negative where it cannot be trusted */
  readonly webkitCompassAccuracy?: number
}

export interface VectorReadingLike {
  readonly x: number | null
  readonly y: number | null
  readonly z: number | null
}

export interface RotationReadingLike {
  readonly alpha: number | null
  readonly beta: number | null
  readonly gamma: number | null
}

/**
 * What a `devicemotion` event carries.
 */
export interface MotionReadingLike {
  /** in metres per second squared, without gravity; `null` where the device cannot separate it */
  readonly acceleration: VectorReadingLike | null
  readonly accelerationIncludingGravity: VectorReadingLike | null
  /** in degrees per second */
  readonly rotationRate: RotationReadingLike | null
  /** how often the device measures, in milliseconds */
  readonly interval: number
}
