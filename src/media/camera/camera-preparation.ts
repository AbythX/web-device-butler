import type { PermissionPreparation } from '../../permission/permission-preparation.ts'
import type { CameraDescriptor } from './model/camera-descriptor.ts'

/**
 * What `prepare()` found out about the cameras. It reports instead of throwing, so an application can go on
 * without a camera.
 */
export interface CameraPreparation extends PermissionPreparation {
  /** `unknown` if the cameras were not asked, because another tab holds them and their features are remembered */
  readonly permission: PermissionPreparation['permission']
  /** every camera that is known, with what was found out about it */
  readonly cameras: readonly CameraDescriptor[]
  /** the camera `open()` would start with the same requirements; `undefined` if none fits */
  readonly selected?: CameraDescriptor
  /**
   * Whether the selected camera can deliver the preferred width and height, or the required ones where none are
   * preferred. `undefined` if neither is asked for or the browser does not say what the camera can deliver.
   */
  readonly isResolutionAvailable?: boolean
}
