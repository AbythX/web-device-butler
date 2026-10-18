/**
 * The waiting times of the access gate, in milliseconds.
 */
export interface MediaAccessTiming {
  /** how long a take-over waits for the holder, in milliseconds */
  takeoverTimeout?: number
  /** how often a device that another tab holds is checked again, in milliseconds */
  availabilityInterval?: number
}
