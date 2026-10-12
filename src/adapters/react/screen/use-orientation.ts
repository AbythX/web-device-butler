import { useCallback, useSyncExternalStore } from 'react'

import type { DeviceOrientation, OrientationKind } from '../../../platform/device-orientation.ts'

/**
 * How the device is held, as state of a component. `undefined` where there is no page, as during server-side
 * rendering.
 */
export const useOrientation = (orientation: DeviceOrientation): OrientationKind | undefined => {
  const subscribe = useCallback(
    (changed: () => void) => {
      const subscription = orientation.on('change', changed)

      return () => subscription.unsubscribe()
    },
    [orientation]
  )

  return useSyncExternalStore(
    subscribe,
    () => orientation.current,
    () => undefined
  )
}
