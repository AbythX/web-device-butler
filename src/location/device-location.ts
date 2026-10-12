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
   * With options that require or prefer something, the call looks through the positions the device reports: it
   * resolves with the first one that has what is required and what is preferred. A device often reports a coarse
   * position first, so this takes longer than a call that asks for nothing. When the `timeout` has passed, it
   * resolves with the best position that has what is required. Without a `timeout` it does not wait for what is
   * preferred, and waits for what is required until the signal aborts it.
   *
   * @throws LocationRequirementsError if no position had what is required when the `timeout` had passed; it
   *   carries the best position that arrived
   * @throws PermissionDeniedError if the user or the browser refused
   * @throws LocationUnavailableError if the device cannot tell where it is
   * @throws LocationTimeoutError if it took longer than the options allow
   * @throws UnsupportedError where the browser has no location for this page
   */
  current(options?: CurrentLocationOptions): Promise<DevicePosition>

  /**
   * Follows the device until the returned watch is stopped. This can show the permission prompt of the browser.
   * Problems arrive as `error` events of the watch. Positions without what the options require are not announced.
   *
   * @throws UnsupportedError where the browser has no location for this page
   */
  watch(options?: LocationOptions): LocationWatch

  /**
   * Stops every watch.
   */
  dispose(): void
}
