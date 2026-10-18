/**
 * The waiting times of a watch of the sensors, in milliseconds.
 */
export interface MotionWatchTiming {
  /** how long the watch waits for the first value before it says the sensor is unavailable, in milliseconds */
  unavailableAfter?: number
}
