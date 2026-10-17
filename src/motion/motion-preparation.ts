import type { DevicePermissionState } from '../permission/permission-state.ts'

/**
 * What `butler.prepare()` found out about the sensors.
 */
export interface MotionPreparation {
  /** whether the page may read how the device is turned and moves; `unsupported` where the browser does not report it */
  readonly permission: DevicePermissionState
}
