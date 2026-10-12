import type { DevicePosition } from './device-position.ts'
import type { CurrentLocationOptions, LocationOptions } from './location-options.ts'
import type { LocationWatch } from './location-watch.ts'

/**
 * Where the device is (`butler.location`). Nothing is asked of the browser before `current()` or `watch()` is
 * called, because asking shows the permission prompt.
 */
export interface DeviceLocation extends Disposable {
  /**
   * `false` where the browser has no location for this page, for example without HTTPS.
   */
  readonly isSupported: boolean

  /**
   * Determines where the device is, once. This can show the permission prompt of the browser.
   *
   * @throws PermissionDeniedError if the user or the browser refused
   * @throws LocationUnavailableError if the device cannot tell where it is
   * @throws LocationTimeoutError if it took longer than the options allow
   * @throws UnsupportedError where the browser has no location for this page
   */
  current(options?: CurrentLocationOptions): Promise<DevicePosition>

  /**
   * Follows the device until the returned watch is stopped. This can show the permission prompt of the browser.
   * Problems arrive as `error` events of the watch.
   *
   * @throws UnsupportedError where the browser has no location for this page
   */
  watch(options?: LocationOptions): LocationWatch

  /**
   * Stops every watch.
   */
  dispose(): void
}
