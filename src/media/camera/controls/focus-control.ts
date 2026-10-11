import type { NumericRange } from '../model/numeric-range.ts'

/**
 * The focus of a camera. A session only has this control if the application can focus its camera.
 */
export interface FocusControl {
  /**
   * `continuous`, `manual`, `single-shot`, ... as the browser names them.
   */
  readonly modes: readonly string[]

  /**
   * Read from the camera, not remembered. `undefined` where the browser does not report it.
   */
  readonly mode: string | undefined

  /**
   * @throws MediaRequirementsError if the camera does not have the mode
   */
  setMode(mode: string): Promise<void>

  /**
   * How close and how far the camera can be focused by hand; `undefined` if it cannot.
   */
  readonly distanceRange: NumericRange | undefined

  /**
   * Read from the camera, not remembered.
   */
  readonly distance: number | undefined

  /**
   * Focuses by hand, which switches the camera to the manual focus mode.
   *
   * @param distance a distance outside of the range is moved to its closest end
   * @throws MediaRequirementsError if the camera cannot be focused by hand
   */
  setDistance(distance: number): Promise<void>
}
