import type { DevicePosition } from './device-position.ts'
import { LocationRequirementsError } from './errors/location-requirements-error.ts'
import type { LocationTraits } from './location-options.ts'

/**
 * Looks through the positions a device reports for the one a call asked for. The first positions of a device are
 * often coarse ones, so a call that requires or prefers something has to look at several.
 */
export class PositionSearch {
  /** the best position that has what is required */
  private fitting: DevicePosition | undefined
  /** the best position that arrived at all */
  private seen: DevicePosition | undefined

  /**
   * @param isPatient whether to go on after a position that has what is required, in the hope of one that also has
   *   what is preferred
   */
  public constructor(
    private readonly require: LocationTraits,
    private readonly prefer: LocationTraits,
    private readonly isPatient: boolean
  ) {}

  /**
   * Takes the next position of the device.
   *
   * @returns the position the call asked for, or `undefined` if the search goes on
   */
  public offer(position: DevicePosition): DevicePosition | undefined {
    this.seen = this.better(this.seen, position)

    if (!position.satisfies(this.require)) {
      return undefined
    }

    this.fitting = this.better(this.fitting, position)

    return position.satisfies(this.prefer) || !this.isPatient ? position : undefined
  }

  /**
   * The outcome when no further position is waited for: the best position that has what is required.
   *
   * @throws LocationRequirementsError if none had it
   */
  public conclude(): DevicePosition {
    if (this.fitting !== undefined) {
      return this.fitting
    }

    throw new LocationRequirementsError(
      this.seen === undefined
        ? 'The device did not determine a position in time'
        : `The best position of the device lacks ${this.seen.missing(this.require).join(', ')}`,
      this.seen
    )
  }

  /**
   * The one that lacks less of what is preferred, then the more accurate one.
   */
  private better(current: DevicePosition | undefined, next: DevicePosition): DevicePosition {
    if (current === undefined) {
      return next
    }

    const lacking = next.missing(this.prefer).length - current.missing(this.prefer).length

    return lacking < 0 || (lacking === 0 && next.accuracy <= current.accuracy) ? next : current
  }
}
