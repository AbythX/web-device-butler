import type { DeviceButlerError } from '../core/errors/device-butler-error.ts'
import type { Watch, WatchEvents } from '../core/lifetime/watch.ts'
import type { DevicePosition } from './device-position.ts'

export interface LocationWatchEvents extends WatchEvents<DevicePosition> {
  /**
   * The device moved, or determined where it is more precisely. Only positions that have what the watch requires
   * are announced; `position.satisfies()` tells whether one also has what is preferred.
   */
  change: DevicePosition
  /** a position could not be determined; the watch goes on unless the permission was refused */
  error: DeviceButlerError
}

/**
 * Follows the position of the device until it is stopped, by the application or because the permission was refused.
 * Created by `butler.location.watch()`, never by the application. `current` is the latest position that has what the
 * watch requires.
 */
export type LocationWatch = Watch<DevicePosition, LocationWatchEvents>
