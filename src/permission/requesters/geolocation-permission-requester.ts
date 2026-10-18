import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { LocationErrorFactory } from '../../location/errors/location-error-factory.ts'
import { LocationSupport } from '../../location/location-support.ts'
import { PermissionDeniedError } from '../errors/permission-denied-error.ts'
import type { DevicePermissionState } from '../permission-state.ts'
import type { PermissionRequester } from './permission-requester.ts'

/**
 * Asks for the location once, which is the only way to make the browser show the prompt.
 */
export class GeolocationPermissionRequester implements PermissionRequester {
  /** in milliseconds; it starts once the user has answered the prompt */
  private static readonly timeout = 10_000

  public constructor(private readonly environment: BrowserEnvironment) {}

  /**
   * `false` outside a secure context and where the browser has no Geolocation API.
   */
  public get isSupported(): boolean {
    return LocationSupport.isSupportedIn(this.environment)
  }

  /**
   * Asks for the position once, which makes the browser prompt where it has to.
   *
   * @returns `granted` or `denied`; `undefined` if the position failed for another reason and only the Permissions
   *   API can tell; `unsupported` where there is no Geolocation API
   */
  public request(): Promise<DevicePermissionState | undefined> {
    const geolocation = LocationSupport.resolveFor(this.environment)

    if (geolocation === undefined) {
      return Promise.resolve('unsupported')
    }

    return new Promise((resolve) => {
      geolocation.getCurrentPosition(
        () => resolve('granted'),
        // a position that could not be determined says nothing about the permission
        (error) => resolve(LocationErrorFactory.from(error) instanceof PermissionDeniedError ? 'denied' : undefined),
        // a device that never finds out where it is must not keep the request waiting forever
        { timeout: GeolocationPermissionRequester.timeout }
      )
    })
  }
}
