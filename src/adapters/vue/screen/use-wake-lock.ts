import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'

import type { ScreenWakeLock } from '../../../screen/wake-lock/screen-wake-lock.ts'
import type { WakeLockHold } from '../../../screen/wake-lock/wake-lock-hold.ts'

export interface UseWakeLock {
  /** whether the browser keeps the screen on right now; `false` while the page is in the background */
  readonly isActive: Ref<boolean>
  /** whether this component asked for the screen to stay on */
  readonly isRequested: Ref<boolean>
  /** why the last request failed; cleared by the next one */
  readonly error: ShallowRef<unknown>
  /** keeps the screen on until `release()` or until the component is unmounted */
  request(): Promise<void>
  release(): void
}

/**
 * Keeping the screen on, as reactive state. The component holds one hold of its own, so it does not let the screen
 * sleep while another part of the application still needs it awake. The hold is released when the component is
 * unmounted.
 */
export const useWakeLock = (wakeLock: ScreenWakeLock): UseWakeLock => {
  const isActive = ref(wakeLock.isActive)
  const isRequested = ref(false)
  const error = shallowRef<unknown>()
  let hold: WakeLockHold | undefined
  let isWanted = false

  const subscription = wakeLock.on('change', (changed) => (isActive.value = changed))

  const release = (): void => {
    isWanted = false
    hold?.release()
    hold = undefined
    isRequested.value = false
  }

  const request = async (): Promise<void> => {
    if (isWanted) {
      return
    }

    isWanted = true
    error.value = undefined

    try {
      const requested = await wakeLock.request()

      // released, or unmounted, while the browser was asked
      if (isWanted) {
        hold = requested
        isRequested.value = true
      } else {
        requested.release()
      }
    } catch (failure) {
      isWanted = false
      error.value = failure
    }
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      release()
      subscription.unsubscribe()
    })
  }

  return { isActive, isRequested, error, request, release }
}
