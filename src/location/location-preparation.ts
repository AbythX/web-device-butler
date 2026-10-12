import type { DevicePermissionState } from '../permission/permission-state.ts'

/**
 * What `butler.prepare()` found out about the location.
 */
export interface LocationPreparation {
  /** whether the application may ask where the device is; `unsupported` where the browser has no location */
  readonly permission: DevicePermissionState
}
