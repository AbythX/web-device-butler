import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'

import type { DeviceLocation } from '../../../location/device-location.ts'
import type { DevicePosition } from '../../../location/device-position.ts'
import type { LocationOptions } from '../../../location/location-options.ts'
import type { LocationWatch } from '../../../location/location-watch.ts'

export interface UseLocation {
  /** the latest position; `undefined` until the first one arrived */
  readonly position: ShallowRef<DevicePosition | undefined>
  /** the latest problem; cleared by the next position */
  readonly error: ShallowRef<unknown>
  readonly isWatching: Ref<boolean>
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
  const position = shallowRef<DevicePosition>()
  const error = shallowRef<unknown>()
  const isWatching = ref(false)
  let watch: LocationWatch | undefined

  const stop = (): void => {
    watch?.stop()
    watch = undefined
    isWatching.value = false
  }

  const start = (options?: LocationOptions): void => {
    stop()
    error.value = undefined

    try {
      const started = location.watch(options)
      started.on('position', (changed) => {
        position.value = changed
        error.value = undefined
      })
      started.on('error', (failure) => {
        error.value = failure
        // a refused permission ends the watch
        isWatching.value = started.isActive
      })

      watch = started
      isWatching.value = true
    } catch (failure) {
      error.value = failure
    }
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(stop)
  }

  return { position, error, isWatching, start, stop }
}
