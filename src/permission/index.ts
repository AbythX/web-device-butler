export { PermissionDeniedError } from './errors/permission-denied-error.ts'

export type { PermissionManager, PermissionManagerEvents } from './permission-manager.ts'

export { DefaultPermissionManager } from './default-permission-manager.ts'

export type {
  DevicePermissionChange,
  DevicePermissionName,
  DevicePermissionState,
  PermissionRequestOptions,
} from './permission-state.ts'

export { GeolocationPermissionRequester } from './requesters/geolocation-permission-requester.ts'

export type { PermissionRequester } from './requesters/permission-requester.ts'

export { PersistentStoragePermissionRequester } from './requesters/persistent-storage-permission-requester.ts'
