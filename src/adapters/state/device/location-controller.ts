import type { DeviceLocation } from '../../../location/device-location.ts'
import type { DevicePosition } from '../../../location/device-position.ts'
import type { LocationOptions } from '../../../location/location-options.ts'
import type { LocationWatch } from '../../../location/location-watch.ts'
import { WatchController, type WatchSnapshot } from './watch-controller.ts'

export interface LocationSnapshot extends WatchSnapshot {
  /** the latest position; `undefined` until the first one arrived */
  readonly position: DevicePosition | undefined
}

/**
 * The position of the device. Nothing is asked of the browser before `start()`, because asking shows the permission
 * prompt. Shared by `useLocation` of both adapters.
 */
export class LocationController extends WatchController<LocationWatch, LocationOptions, LocationSnapshot> {
  /**
   * @param location a getter, so a component can hand over another one
   */
  public constructor(private readonly location: () => DeviceLocation) {
    super({ position: undefined })
  }

  protected open(options?: LocationOptions): LocationWatch {
    return this.location().watch(options)
  }

  protected listen(watch: LocationWatch): void {
    // the latest problem is cleared by the next position
    watch.on('change', (position) => this.change({ position, error: undefined }))
    // a refused permission ends the watch
    watch.on('error', (error) => this.change({ error, isWatching: watch.isActive }))
  }
}
