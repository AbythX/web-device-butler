import type { DevicePosition } from '../device-position.ts'
import { LocationError } from './location-error.ts'

/**
 * The device did not determine a position that has what was required within the time the call allowed.
 */
export class LocationRequirementsError extends LocationError {
  /**
   * @param position the best position that arrived; `undefined` if none did
   */
  public constructor(
    message: string,
    public readonly position?: DevicePosition,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'LocationRequirementsError'
  }
}
