import type { PermissionPreparation } from '../permission/permission-preparation.ts'

/**
 * What `butler.prepare()` found out about the location: whether the application may ask where the device is, and
 * why not. `unsupported` where the browser has no location.
 */
export type LocationPreparation = PermissionPreparation
