import type { BrowserEnvironment } from '../core/environment/browser-environment.ts'

/**
 * Whether the page can ask where the device is. Shared by the location and by the request of its permission, so both
 * say the same.
 */
export class LocationSupport {
  /**
   * `false` outside a secure context and where the browser has no Geolocation API.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return LocationSupport.resolveFor(environment) !== undefined
  }

  /**
   * The Geolocation API where the page may use it; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): Geolocation | undefined {
    return environment.secureContext?.geolocation
  }
}
