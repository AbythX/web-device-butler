/**
 * The permissions the library can ask about and request.
 */
export type DevicePermissionName = 'camera' | 'microphone' | 'geolocation' | 'persistent-storage'

/**
 * - `prompt`: the browser asks the user when the permission is requested
 * - `unknown`: this browser cannot tell before the permission is requested
 * - `unsupported`: what the permission is for does not exist here, for example a camera on a page without HTTPS
 */
export type DevicePermissionState = 'granted' | 'denied' | 'prompt' | 'unknown' | 'unsupported'

export interface DevicePermissionChange {
  readonly name: DevicePermissionName
  readonly state: DevicePermissionState
}

export interface PermissionRequestOptions {
  /** for the camera: which side to request access for. Without it, both sides are requested. */
  facing?: 'front' | 'back'
}
