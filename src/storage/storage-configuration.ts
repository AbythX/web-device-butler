/**
 * The storage section of the configuration passed to `DefaultDeviceButler.create()`.
 */
export interface StorageConfiguration {
  /**
   * A prefix for every store, so several applications on one origin do not see each other's data. Default:
   * `web-device-butler`.
   */
  namespace?: string
}
