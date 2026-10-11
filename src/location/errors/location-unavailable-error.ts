import { LocationError } from './location-error.ts'

/**
 * The device could not determine where it is, for example without a signal. Trying again later can work.
 */
export class LocationUnavailableError extends LocationError {
  public constructor(options?: ErrorOptions) {
    super('The position of the device could not be determined', options)
    this.name = 'LocationUnavailableError'
  }
}
