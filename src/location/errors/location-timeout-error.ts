import { LocationError } from './location-error.ts'

/**
 * The device did not determine where it is within the time the call allowed.
 */
export class LocationTimeoutError extends LocationError {
  public constructor(options?: ErrorOptions) {
    super('The position of the device was not determined in time', options)
    this.name = 'LocationTimeoutError'
  }
}
