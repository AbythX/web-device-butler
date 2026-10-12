import type { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import type { DevicePermissionState } from '../../permission/permission-state.ts'
import type { CameraDescriptor } from './model/camera-descriptor.ts'

/**
 * What `prepare()` found out about the cameras. It reports instead of throwing, so an application can go on
 * without a camera.
 */
export interface CameraPreparation {
  /** `unknown` if the cameras were not asked, because another tab holds them and their features are remembered */
  readonly permission: DevicePermissionState
  /** every camera that is known, with what was found out about it */
  readonly cameras: readonly CameraDescriptor[]
  /** the camera `open()` would start with the same requirements; `undefined` if none fits */
  readonly selected?: CameraDescriptor
  /**
   * Whether the selected camera can deliver the configured resolution. `undefined` if no resolution is configured
   * or the browser does not say what the camera can deliver.
   */
  readonly isResolutionAvailable?: boolean
  /** why there is no selected camera */
  readonly error?: DeviceButlerError
}
