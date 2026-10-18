import type { DeviceOrientation, OrientationKind } from '../../../platform/device-orientation.ts'
import { useEventValue } from '../use-event-value.ts'

/**
 * How the device is held, as state of a component. `undefined` where there is no page, as during server-side
 * rendering.
 */
export const useOrientation = (orientation: DeviceOrientation): OrientationKind | undefined => {
  return useEventValue(orientation, 'change', () => orientation.current, undefined)
}
