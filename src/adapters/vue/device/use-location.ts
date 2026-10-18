import type { DeviceLocation } from '../../../location/device-location.ts'
import type { LocationOptions } from '../../../location/location-options.ts'
import { LocationController, type LocationSnapshot } from '../../state/device/location-controller.ts'
import { type SnapshotRefs, useController } from '../use-controller.ts'

export interface UseLocation extends SnapshotRefs<LocationSnapshot> {
  /** starts following the device, which can show the permission prompt of the browser */
  start(options?: LocationOptions): void
  /** stops following the device; the last position stays */
  stop(): void
}

/**
 * The position of the device as reactive state. Nothing is asked of the browser before `start()` is called, because
 * asking shows the permission prompt. The watch is stopped when the component is unmounted.
 */
export const useLocation = (location: DeviceLocation): UseLocation => {
  const controller = new LocationController(() => location)

  return { ...useController(controller), start: controller.start, stop: controller.stop }
}
