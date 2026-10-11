import type { DevicePermissionState, PermissionRequestOptions } from '../permission-state.ts'

/**
 * How one permission is requested. Browsers have no call that only asks for a permission; the prompt appears when
 * the feature is used, and each feature is used in its own way.
 */
export interface PermissionRequester {
  /** `false` where the browser does not have what the permission is for */
  readonly isSupported: boolean

  /**
   * Uses the feature, so the browser asks the user where it has to.
   *
   * @returns the new state, or `undefined` if only the Permissions API can tell
   */
  request(options: PermissionRequestOptions): Promise<DevicePermissionState | undefined>

  /**
   * What is known without asking the user, for browsers whose Permissions API does not cover the permission.
   */
  query?(): Promise<DevicePermissionState | undefined>
}
