import type { MediaInputRequirements } from '../../input/media-input-requirements.ts'

/**
 * What can be asked of a camera. The same shape says what a camera must have (`require`) and what it should have
 * (`prefer`). A field that is not set, or set to `false`, asks for nothing.
 */
export interface CameraTraits {
  /**
   * Which side the camera is on. On a device where no camera says which side it is on, such as a laptop, the
   * cameras that do not say are used instead.
   */
  facing?: 'front' | 'back'
  torch?: boolean
  zoom?: boolean
  /** focusing by the application: by hand, or a choice among several focus modes */
  focus?: boolean
  /**
   * In pixels. Together with `height` it is one size, which the camera can deliver whichever way the device is
   * held. Alone it is the width of the picture as the browser reports it, with the device held sideways.
   */
  width?: number
  /** in pixels; see `width` */
  height?: number
  /** frames per second */
  frameRate?: number
}

/**
 * - `best`: look at every camera that can match and take the best one
 * - `first`: take the first camera that has what is required, which starts fewer cameras on the first visit
 */
export type CameraSelectionStrategy = 'best' | 'first'

/**
 * What an application asks of a camera. The same shape is the `camera` section of the configuration (the defaults)
 * and the argument of `open()`, `select()` and `switchTo()` (the overrides for one call).
 *
 * The preferred width, height and frame rate are also what the running camera is asked to deliver, the closest it
 * can do; where none is preferred, the required one is.
 */
export interface CameraRequirements extends MediaInputRequirements {
  /** a camera without these is never returned */
  require?: CameraTraits
  /** among the cameras that have what is required, those with these are ranked higher */
  prefer?: CameraTraits
  /** default: `best` */
  strategy?: CameraSelectionStrategy
  /**
   * Start the camera again when the system ends it, for example when the page returns from the background on iOS.
   * Default: `false`, the session ends.
   */
  autoRecover?: boolean
}

/**
 * The `camera` section of the configuration passed to `DefaultDeviceButler.create()`.
 */
export type CameraConfiguration = Omit<CameraRequirements, 'signal'>
