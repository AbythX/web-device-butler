import type { ZoomRange } from '../model/numeric-range.ts'

/**
 * The zoom of a camera. A session only has this control if its camera can zoom.
 */
export interface ZoomControl {
  /**
   * How far the camera zooms, read from the camera.
   */
  readonly range: ZoomRange

  /**
   * Read from the camera, not remembered.
   */
  readonly level: number

  /**
   * Whether the camera is zoomed out as far as it goes.
   */
  readonly isMinimum: boolean

  /**
   * Whether the camera is zoomed in as far as it goes.
   */
  readonly isMaximum: boolean

  /**
   * @param level a level outside of the range is moved to its closest end
   */
  set(level: number): Promise<void>

  /**
   * Zooms in by one step of the camera, or by the given number of steps.
   */
  increase(steps?: number): Promise<void>

  /**
   * Zooms out by one step of the camera, or by the given number of steps.
   */
  decrease(steps?: number): Promise<void>
}
