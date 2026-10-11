import type { Listenable } from '../core/events/listenable.ts'

import type { DeviceError } from '../core/errors/device-error.ts'
import type { DevicePosition } from './device-position.ts'

export interface LocationWatchEvents {
  /** the device moved, or determined where it is more precisely */
  position: DevicePosition
  /** a position could not be determined; the watch goes on unless the permission was refused */
  error: DeviceError
}

/**
 * Follows the position of the device until it is stopped. Created by `device.location.watch()`, never by the
 * application.
 */
export interface LocationWatch extends Listenable<LocationWatchEvents>, Disposable {
  /**
   * `false` once the watch has been stopped, by the application or because the permission was refused.
   */
  readonly isActive: boolean

  /**
   * The latest position; `undefined` until the first one arrived.
   */
  readonly position: DevicePosition | undefined

  /**
   * Stops following the device and forgets every listener. Stopping a watch that has stopped does nothing.
   */
  stop(): void
}
