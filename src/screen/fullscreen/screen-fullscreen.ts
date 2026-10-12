import type { Listenable } from '../../core/events/listenable.ts'

export interface ScreenFullscreenEvents {
  /** another element fills the screen, or none does any more; the payload is the new `element` */
  change: Element | undefined
}

/**
 * Fills the screen with one element of the page (`butler.fullscreen`), for a capture screen or a player.
 *
 * Browsers name the calls differently, and a phone whose browser cannot fill the screen with any element can still
 * do it with a video. Both are hidden here: `canEnter()` says whether an element can fill the screen, `enter()`
 * does it the way the browser offers.
 */
export interface ScreenFullscreen extends Listenable<ScreenFullscreenEvents>, Disposable {
  /**
   * Whether the browser can fill the screen with any element of the page. `false` on a phone that only does it
   * with videos; ask {@link canEnter} about a video there.
   */
  readonly isSupported: boolean

  /**
   * The element that fills the screen, or `undefined` if none does.
   */
  readonly element: Element | undefined

  /**
   * Whether an element fills the screen.
   */
  readonly isActive: boolean

  /**
   * Whether this element can fill the screen.
   */
  canEnter(element: Element): boolean

  /**
   * Fills the screen with the element. Browsers only allow it in answer to something the user did, such as a click.
   *
   * @throws UnsupportedError if the browser cannot fill the screen with this element
   * @throws ScreenError if the browser refuses, for example because the user did not ask for it
   */
  enter(element: Element, options?: FullscreenOptions): Promise<void>

  /**
   * Returns to the page. Does nothing if no element fills the screen.
   *
   * @throws ScreenError if the browser refuses
   */
  exit(): Promise<void>

  /**
   * Stops watching and forgets every listener. An element that fills the screen stays there.
   */
  dispose(): void
}
