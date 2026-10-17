/**
 * A few patterns that read the same on every device:
 * - `tap`: a short tick, for a button that was pressed
 * - `success`: two short pulses, for something that worked, such as a code that was read
 * - `error`: three firm pulses, for something that went wrong
 * - `long`: one long pulse, to get attention
 */
export type VibrationName = 'tap' | 'success' | 'error' | 'long'

/**
 * A named pattern, a length in milliseconds, or lengths of vibration and pause one after another.
 */
export type VibrationPattern = VibrationName | number | readonly number[]

/**
 * Makes the device vibrate (`butler.vibration`). Safari has no vibration, and most desktops nothing to vibrate with.
 * Chromium only vibrates for a page the user has clicked or tapped on before.
 */
export interface DeviceVibration {
  /**
   * `false` where the browser cannot make the device vibrate, as Safari.
   */
  readonly isSupported: boolean

  /**
   * Starts the pattern, in place of one that runs.
   *
   * @returns whether the browser took it; `false` where it cannot vibrate, or before the user has used the page
   */
  vibrate(pattern: VibrationPattern): boolean

  /**
   * Stops a pattern that runs.
   */
  stop(): void
}
