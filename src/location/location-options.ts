/**
 * What can be asked of a position. The same shape says what a position must have (`require`) and what it should
 * have (`prefer`). A field that is not set, or set to `false`, asks for nothing.
 */
export interface LocationTraits {
  /** how far the real position may be from the reported one, in metres */
  accuracy?: number
  /** the position says how high the device is */
  altitude?: boolean
  /** the position says in which direction the device travels; a device that does not move cannot tell */
  heading?: boolean
  /** the position says how fast the device travels */
  speed?: boolean
}

/**
 * How a position is determined, and which positions count. Plain data. The same shape is the `location` section of
 * the configuration (the defaults) and the argument of `current()` and `watch()` (the overrides for one call).
 */
export interface LocationOptions {
  /** a position without these is never returned or announced */
  require?: LocationTraits
  /**
   * `current()` waits for a position with these, as long as its `timeout` allows, and returns the best one that
   * has what is required otherwise. Without a `timeout` it does not wait.
   */
  prefer?: LocationTraits
  /**
   * Ask for the best position the device can give, which takes longer and uses more power (GPS instead of the
   * network). Default: `false`.
   */
  highAccuracy?: boolean
  /** how long determining a position may take, in milliseconds; default: no limit */
  timeout?: number
  /** how old a position the device remembers may be to count, in milliseconds; default: `0`, always a new one */
  maximumAge?: number
}

export interface CurrentLocationOptions extends LocationOptions {
  /** stops waiting for the position; the returned promise rejects with the reason of the signal */
  signal?: AbortSignal
}

/**
 * The `location` section of the configuration passed to `DefaultDeviceButler.create()`.
 */
export type LocationConfiguration = LocationOptions
