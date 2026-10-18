import type { PermissionPreparation } from '../permission/permission-preparation.ts'

/**
 * What `butler.prepare()` found out about the sensors: whether the page may read how the device is turned and moves,
 * and why not. `unsupported` where the browser does not report it.
 */
export type MotionPreparation = PermissionPreparation
