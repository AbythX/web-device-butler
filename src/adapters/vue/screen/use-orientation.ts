import { ref, type Ref } from 'vue'

import type { DeviceOrientation, OrientationKind } from '../../../platform/device-orientation.ts'
import { untilScopeEnd } from '../scope.ts'

/**
 * How the device is held, as reactive state. `undefined` where there is no page, as during server-side rendering.
 */
export const useOrientation = (orientation: DeviceOrientation): Ref<OrientationKind | undefined> => {
  const current = ref(orientation.current)

  untilScopeEnd(orientation.on('change', (changed) => (current.value = changed)))

  return current
}
