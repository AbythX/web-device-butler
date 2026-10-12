import type { DeviceButlerError } from '../core/errors/device-butler-error.ts'
import type { StorageCapabilities } from './storage-capabilities.ts'

/**
 * What `prepare()` found out about the storage. It reports instead of throwing, so an application can go on
 * without stored data.
 */
export interface StoragePreparation {
  /** what the backend `open()` would use with the same requirements can do; `undefined` if none fits */
  readonly capabilities?: StorageCapabilities
  /** whether the browser has promised not to evict the data of the origin */
  readonly isPersistent: boolean
  /** why there is no backend */
  readonly error?: DeviceButlerError
}
