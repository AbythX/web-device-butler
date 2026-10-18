import type { DeviceLocation } from '../../../location/device-location.ts'
import type { DevicePosition } from '../../../location/device-position.ts'
import type { LocationOptions } from '../../../location/location-options.ts'
import { LocationController } from '../../state/device/location-controller.ts'
import { useController, useLatest, useSnapshot } from '../use-controller.ts'

export interface UseLocation {
  /** the latest position; `undefined` until the first one arrived */
  readonly position: DevicePosition | undefined
  /** the latest problem; cleared by the next position */
  readonly error: unknown
  readonly isWatching: boolean
  /** starts following the device, which can show the permission prompt of the browser */
  start(options?: LocationOptions): void
  /** stops following the device; the last position stays */
  stop(): void
}

/**
 * The position of the device as state of a component. Nothing is asked of the browser before `start()` is called,
 * because asking shows the permission prompt. The watch is stopped when the component is unmounted.
 */
export const useLocation = (location: DeviceLocation): UseLocation => {
  const latest = useLatest(location)
  const controller = useController(() => new LocationController(() => latest.current))

  return { ...useSnapshot(controller), start: controller.start, stop: controller.stop }
}
