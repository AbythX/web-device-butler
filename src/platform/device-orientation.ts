import type { Listenable } from '../core/events/listenable.ts'

/**
 * How the page is held: `portrait` is taller than wide, `landscape` wider than tall.
 */
export type OrientationKind = 'portrait' | 'landscape'

export interface DeviceOrientationEvents {
  /** the device was turned, or the window was resized across the diagonal */
  change: OrientationKind
}

/**
 * How the device is held (`butler.orientation`), as far as the page can tell: it follows the shape of the page, so
 * a desktop window that is made narrow counts as portrait. For the same reason a phone that is held upright can
 * report `landscape` while its keyboard is open, because the keyboard leaves the page wider than tall.
 */
export interface DeviceOrientation extends Listenable<DeviceOrientationEvents>, Disposable {
  /**
   * `undefined` where there is no page, as during server-side rendering.
   */
  readonly current: OrientationKind | undefined

  /**
   * Whether the viewport is taller than wide.
   */
  readonly isPortrait: boolean

  /**
   * Whether the viewport is wider than tall.
   */
  readonly isLandscape: boolean

  /**
   * Whether the browser can keep the page from turning. Where it can, most browsers only do it for a page that
   * fills the screen (`butler.fullscreen`).
   */
  readonly canLock: boolean

  /**
   * Keeps the page the way it is asked for, however the device is held, until {@link unlock} or until the page
   * stops filling the screen.
   *
   * @throws UnsupportedError where the browser or the device cannot keep the page from turning
   * @throws ScreenError if the browser refuses, for example because the page does not fill the screen
   */
  lock(orientation: OrientationKind): Promise<void>

  /**
   * Lets the page turn with the device again. Does nothing where the browser cannot keep it from turning.
   */
  unlock(): void

  /**
   * Stops watching and forgets every listener.
   */
  dispose(): void
}
