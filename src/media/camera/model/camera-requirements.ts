import type { MediaInputRequirements } from '../../input/media-input-requirements.ts'
import type { ResolutionLike } from './resolution.ts'

/**
 * Features a camera is asked for. A field that is not set, or set to `false`, asks for nothing.
 */
export interface CameraFeatureRequirements {
  torch?: boolean
  zoom?: boolean
  /** focusing by the application: by hand, or a choice among several focus modes */
  focus?: boolean
  /** the camera can deliver at least this, whichever way the device is held */
  minResolution?: ResolutionLike
  minFrameRate?: number
}

export interface ResolutionRequirement extends ResolutionLike {
  /**
   * - `ideal` (default): the closest the camera can do
   * - `exact`: fail with `MediaRequirementsError` if the camera cannot deliver it
   */
  mode?: 'ideal' | 'exact'
}

/**
 * - `best`: look at every camera that can match and take the best one
 * - `first`: take the first camera that has what is required, which starts fewer cameras on the first visit
 */
export type CameraSelectionStrategy = 'best' | 'first'

/**
 * What an application asks of a camera. The same shape is the `camera` section of the configuration (the defaults)
 * and the argument of `open()`, `select()` and `switchTo()` (the overrides for one call).
 */
export interface CameraRequirements extends MediaInputRequirements {
  /**
   * Which side the camera is on. On a device where no camera says which side it is on, such as a laptop, the
   * cameras that do not say are used instead.
   */
  facing?: 'front' | 'back'
  /** a camera without these is never returned */
  require?: CameraFeatureRequirements
  /** among the cameras that have what is required, those with these are ranked higher */
  prefer?: CameraFeatureRequirements
  resolution?: ResolutionRequirement
  /** frames per second, the closest the camera can do */
  frameRate?: number
  /** default: `best` */
  strategy?: CameraSelectionStrategy
  /**
   * Start the camera again when the system ends it, for example when the page returns from the background on iOS.
   * Default: `false`, the session ends.
   */
  autoRecover?: boolean
}

/**
 * The `camera` section of the configuration passed to `DefaultDevice.create()`.
 */
export type CameraConfiguration = Omit<CameraRequirements, 'signal'>
