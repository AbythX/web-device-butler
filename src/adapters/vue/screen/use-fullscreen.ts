import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'

import type { ScreenFullscreen } from '../../../screen/fullscreen/screen-fullscreen.ts'
import { untilScopeEnd } from '../scope.ts'

export interface UseFullscreen {
  /** the element that fills the screen; follows the user leaving with the key or the gesture of the system */
  readonly element: ShallowRef<Element | undefined>
  readonly isActive: ComputedRef<boolean>
  /** why the last `enter()` or `exit()` failed; cleared by the next one */
  readonly error: ShallowRef<unknown>
  /** fills the screen with the element, in answer to a click. A failure is not thrown, it ends up in `error`. */
  enter(element: Element, options?: FullscreenOptions): Promise<void>
  exit(): Promise<void>
}

/**
 * What fills the screen, as reactive state.
 */
export const useFullscreen = (fullscreen: ScreenFullscreen): UseFullscreen => {
  const element = shallowRef(fullscreen.element)
  const error = shallowRef<unknown>()

  untilScopeEnd(fullscreen.on('change', (changed) => (element.value = changed)))

  const attempt = async (work: () => Promise<void>): Promise<void> => {
    error.value = undefined

    try {
      await work()
      element.value = fullscreen.element
    } catch (failure) {
      error.value = failure
    }
  }

  return {
    element,
    isActive: computed(() => element.value !== undefined),
    error,
    enter: (target, options) => attempt(() => fullscreen.enter(target, options)),
    exit: () => attempt(() => fullscreen.exit()),
  }
}
