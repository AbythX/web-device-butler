/**
 * How a position is determined. Plain data.
 */
export interface LocationOptions {
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
