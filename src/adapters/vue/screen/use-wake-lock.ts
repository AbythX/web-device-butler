import { ref, type Ref, type ShallowRef } from 'vue'

import type { ScreenWakeLock } from '../../../screen/wake-lock/screen-wake-lock.ts'
import { WakeLockController } from '../../state/screen/wake-lock-controller.ts'
import { untilScopeEnd } from '../scope.ts'
import { useController } from '../use-controller.ts'

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
  const controller = new WakeLockController(() => wakeLock)
  const isActive = ref(wakeLock.isActive)

  untilScopeEnd(wakeLock.on('change', (changed) => (isActive.value = changed)))

  return { ...useController(controller), isActive, request: controller.request, release: controller.release }
}
