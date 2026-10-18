import type { Preparation } from '../core/preparation/preparation.ts'
import type { DevicePermissionState } from './permission-state.ts'

/**
 * What `prepare()` found out about a part that needs a permission.
 */
export interface PermissionPreparation extends Preparation {
  /** the permission of the part after it was asked for; `unsupported` where the part does not exist here */
  readonly permission: DevicePermissionState
}
