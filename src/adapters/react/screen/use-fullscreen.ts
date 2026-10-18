import { useCallback, useState } from 'react'

import type { ScreenFullscreen } from '../../../screen/fullscreen/screen-fullscreen.ts'
import { useEventValue } from '../use-event-value.ts'

export interface UseFullscreen {
  /** the element that fills the screen; follows the user leaving with the key or the gesture of the system */
  readonly element: Element | undefined
  readonly isActive: boolean
  /** why the last `enter()` or `exit()` failed; cleared by the next one */
  readonly error: unknown
  /** fills the screen with the element, in answer to a click. A failure is not thrown, it ends up in `error`. */
  enter(element: Element, options?: FullscreenOptions): Promise<void>
  exit(): Promise<void>
}

/**
 * What fills the screen, as state of a component.
 */
export const useFullscreen = (fullscreen: ScreenFullscreen): UseFullscreen => {
  const [error, setError] = useState<unknown>()

  const element = useEventValue(fullscreen, 'change', () => fullscreen.element, undefined)

  const attempt = useCallback(async (work: () => Promise<void>): Promise<void> => {
    setError(undefined)

    try {
      await work()
    } catch (failure) {
      setError(failure)
    }
  }, [])

  const enter = useCallback(
    (target: Element, options?: FullscreenOptions) => attempt(() => fullscreen.enter(target, options)),
    [attempt, fullscreen]
  )

  const exit = useCallback(() => attempt(() => fullscreen.exit()), [attempt, fullscreen])

  return { element, isActive: element !== undefined, error, enter, exit }
}
