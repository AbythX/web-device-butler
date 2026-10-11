import { DeviceError } from '../../core/errors/device-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { LocationError } from './location-error.ts'
import { LocationTimeoutError } from './location-timeout-error.ts'
import { LocationUnavailableError } from './location-unavailable-error.ts'

/**
 * The single place that turns what the browser reports for the location into the errors of the library, so the
 * codes of `GeolocationPositionError` never reach the application.
 */
export class LocationErrorFactory {
  private static readonly permissionDenied = 1
  private static readonly positionUnavailable = 2
  private static readonly timeout = 3

  /**
   * Translates what the Geolocation API fails with into an error of the library. An error of the library is
   * returned as it is.
   */
  public static from(error: unknown): DeviceError {
    if (error instanceof DeviceError) {
      return error
    }

    switch (LocationErrorFactory.codeOf(error)) {
      case LocationErrorFactory.permissionDenied:
        return new PermissionDeniedError('geolocation', { cause: error })
      case LocationErrorFactory.positionUnavailable:
        return new LocationUnavailableError({ cause: error })
      case LocationErrorFactory.timeout:
        return new LocationTimeoutError({ cause: error })
      default:
        return new LocationError('Could not determine the position of the device', { cause: error })
    }
  }

  private static codeOf(error: unknown): number | undefined {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number'
      ? error.code
      : undefined
  }
}
