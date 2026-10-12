import { useCallback, useEffect, useRef, useState } from 'react'

import type { DeviceLocation } from '../../../location/device-location.ts'
import type { DevicePosition } from '../../../location/device-position.ts'
import type { LocationOptions } from '../../../location/location-options.ts'
import type { LocationWatch } from '../../../location/location-watch.ts'

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
  const [position, setPosition] = useState<DevicePosition>()
  const [error, setError] = useState<unknown>()
  const [isWatching, setIsWatching] = useState(false)
  const watch = useRef<LocationWatch | undefined>(undefined)

  const stop = useCallback((): void => {
    watch.current?.stop()
    watch.current = undefined
    setIsWatching(false)
  }, [])

  const start = useCallback(
    (options?: LocationOptions): void => {
      stop()
      setError(undefined)

      try {
        const started = location.watch(options)
        started.on('position', (changed) => {
          setPosition(changed)
          setError(undefined)
        })
        started.on('error', (failure) => {
          setError(failure)
          // a refused permission ends the watch
          setIsWatching(started.isActive)
        })

        watch.current = started
        setIsWatching(true)
      } catch (failure) {
        setError(failure)
      }
    },
    [location, stop]
  )

  useEffect(
    () => () => {
      watch.current?.stop()
      watch.current = undefined
    },
    []
  )

  return { position, error, isWatching, start, stop }
}
