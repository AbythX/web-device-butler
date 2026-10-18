import type { PermissionPreparation } from '../../permission/permission-preparation.ts'

/**
 * What `butler.prepare()` found out about the notifications: whether the page may show them, and why not.
 * `unsupported` where the page cannot show notifications.
 */
export type NotificationPreparation = PermissionPreparation
