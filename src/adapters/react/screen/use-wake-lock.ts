import type { ScreenWakeLock } from '../../../screen/wake-lock/screen-wake-lock.ts'
import { WakeLockController, type WakeLockSnapshot } from '../../state/screen/wake-lock-controller.ts'
import { useController, useLatest, useSnapshot } from '../use-controller.ts'
import { useEventValue } from '../use-event-value.ts'

export interface UseWakeLock extends WakeLockSnapshot {
  /** whether the browser keeps the screen on right now; `false` while the page is in the background */
  readonly isActive: boolean
  /** keeps the screen on until `release()` or until the component is unmounted */
  request(): Promise<void>
  release(): void
}

/**
 * Keeping the screen on, as state of a component. The component holds one hold of its own, so it does not let the
 * screen sleep while another part of the application still needs it awake. The hold is released when the component
 * is unmounted.
 */
export const useWakeLock = (wakeLock: ScreenWakeLock): UseWakeLock => {
  const latest = useLatest(wakeLock)
  const controller = useController(() => new WakeLockController(() => latest.current))
  const isActive = useEventValue(wakeLock, 'change', () => wakeLock.isActive, false)

  return { ...useSnapshot(controller), isActive, request: controller.request, release: controller.release }
}
