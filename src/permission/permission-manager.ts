import type { Listenable } from '../core/events/listenable.ts'

import type {
  DevicePermissionChange,
  DevicePermissionName,
  DevicePermissionState,
  PermissionRequestOptions,
} from './permission-state.ts'

export interface PermissionManagerEvents {
  change: DevicePermissionChange
}

/**
 * The one place to ask about and request the permissions of the device (`butler.permission`), so an application can
 * drive a permission screen without knowing how each browser handles each permission.
 */
export interface PermissionManager extends Listenable<PermissionManagerEvents>, Disposable {
  /**
   * The state of the permission, without asking the user. Never rejects.
   */
  query(name: DevicePermissionName): Promise<DevicePermissionState>

  /**
   * Requests the permission. The browser asks the user where it has to; for the camera and the microphone a device
   * is started for a moment.
   *
   * @returns the new state. A refusal is a state, not an error.
   * @throws MediaDeviceBusyError if the camera or the microphone is held, in this tab or another
   */
  request(name: DevicePermissionName, options?: PermissionRequestOptions): Promise<DevicePermissionState>

  /**
   * Stops watching the permissions and forgets every listener.
   */
  dispose(): void
}
