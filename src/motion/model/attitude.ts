/**
 * How the device is turned, relative to the screen as it is held: the same values whether a phone is held upright
 * or sideways.
 */
export interface Attitude {
  /**
   * How far the screen is turned around its axis from left to right, in degrees: `0` lying flat with the screen up,
   * `90` held upright facing the user, more than that when it is tilted back further, negative with the top edge
   * lowered. From -180 to 180.
   */
  readonly pitch: number
  /**
   * How far the right edge of the screen is below the horizon, in degrees: `0` level, negative with the left edge
   * lowered. From -90 to 90. This is what a spirit level shows; the angle `gamma` of the browser is larger while the
   * device is pitched.
   */
  readonly roll: number
  /**
   * Where the device points, in degrees clockwise from north: the top edge of the screen while it lies more flat
   * than upright, the back of the device while it is held more upright. `undefined` where the device cannot tell
   * north, as on a desktop or in browsers without a compass for the page.
   */
  readonly heading: number | undefined
  /** what the browser reported, in its own frame and in degrees */
  readonly raw: AttitudeReading
}

/**
 * The angles as the browser reports them, in the frame of the device held the natural way.
 */
export interface AttitudeReading {
  /** around the axis out of the screen */
  readonly alpha: number | undefined
  /** around the axis from left to right: front to back */
  readonly beta: number | undefined
  /** around the axis from bottom to top: left to right */
  readonly gamma: number | undefined
  /** whether `alpha` is measured from north */
  readonly absolute: boolean
}

/**
 * A value along the three axes of the screen as it is held: `x` to the right, `y` to the top edge, `z` out of the
 * screen towards the user.
 */
export interface MotionVector {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * How the device moves, along the axes of the screen as it is held.
 */
export interface Movement {
  /** in metres per second squared, without gravity; `undefined` where the device cannot separate gravity */
  readonly acceleration: MotionVector | undefined
  /** in metres per second squared; a device lying still has 9.8 along `z` */
  readonly accelerationIncludingGravity: MotionVector | undefined
  /** in degrees per second, around each axis; `undefined` without a gyroscope */
  readonly rotationRate: MotionVector | undefined
  /** how often the device measures, in milliseconds */
  readonly interval: number
}
