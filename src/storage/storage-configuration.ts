import type { StorageRequirements } from './selection/storage-requirements.ts'

/**
 * The storage section of the configuration passed to `DefaultDeviceButler.create()`. Its `driver`, `require` and
 * `prefer` are the defaults of every `open()`.
 */
export interface StorageConfiguration extends StorageRequirements {
  /**
   * A prefix for every store, so several applications on one origin do not see each other's data. Default:
   * `web-device-butler`.
   */
  namespace?: string
}
