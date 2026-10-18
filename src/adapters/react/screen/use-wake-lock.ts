import { useCallback, useEffect, useRef, useState } from 'react'

import type { ScreenWakeLock } from '../../../screen/wake-lock/screen-wake-lock.ts'
import type { WakeLockHold } from '../../../screen/wake-lock/wake-lock-hold.ts'
import { useEventValue } from '../use-event-value.ts'

export interface UseWakeLock {
  /** whether the browser keeps the screen on right now; `false` while the page is in the background */
  readonly isActive: boolean
  /** whether this component asked for the screen to stay on */
  readonly isRequested: boolean
  /** why the last request failed; cleared by the next one */
  readonly error: unknown
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
  const [isRequested, setIsRequested] = useState(false)
  const [error, setError] = useState<unknown>()
  const hold = useRef<WakeLockHold | undefined>(undefined)
  const isWanted = useRef(false)

  const isActive = useEventValue(wakeLock, 'change', () => wakeLock.isActive, false)

  const release = useCallback((): void => {
    isWanted.current = false
    hold.current?.release()
    hold.current = undefined
    setIsRequested(false)
  }, [])

  const request = useCallback(async (): Promise<void> => {
    if (isWanted.current) {
      return
    }

    isWanted.current = true
    setError(undefined)

    try {
      const requested = await wakeLock.request()

      // released, or unmounted, while the browser was asked
      if (isWanted.current) {
        hold.current = requested
        setIsRequested(true)
      } else {
        requested.release()
      }
    } catch (failure) {
      isWanted.current = false
      setError(failure)
    }
  }, [wakeLock])

  useEffect(
    () => () => {
      isWanted.current = false
      hold.current?.release()
      hold.current = undefined
    },
    []
  )

  return { isActive, isRequested, error, request, release }
}
