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
   * Stops watching and forgets every listener.
   */
  dispose(): void
}
