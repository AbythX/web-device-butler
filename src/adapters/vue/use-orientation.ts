import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'

import type { DeviceOrientation, OrientationKind } from '../../platform/device-orientation.ts'

/**
 * How the device is held, as reactive state. `undefined` where there is no page, as during server-side rendering.
 */
export const useOrientation = (orientation: DeviceOrientation): Ref<OrientationKind | undefined> => {
  const current = ref(orientation.current)

  const subscription = orientation.on('change', (changed) => (current.value = changed))

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => subscription.unsubscribe())
  }

  return current
}
