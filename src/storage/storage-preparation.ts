import type { Preparation } from '../core/preparation/preparation.ts'
import type { StorageCapabilities } from './storage-capabilities.ts'

/**
 * What `prepare()` found out about the storage. It reports instead of throwing, so an application can go on
 * without stored data.
 */
export interface StoragePreparation extends Preparation {
  /** what the backend `open()` would use with the same requirements can do; `undefined` if none fits */
  readonly capabilities?: StorageCapabilities
  /** whether the browser has promised not to evict the data of the origin */
  readonly isPersistent: boolean
}
