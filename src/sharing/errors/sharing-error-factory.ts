import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { SharingError } from './sharing-error.ts'

/**
 * The single place that turns what the browser throws when sharing or copying into the errors of the library.
 */
export class SharingErrorFactory {
  /**
   * @param permission what the browser refuses with a `NotAllowedError`: `share` or `clipboard`
   * @param message what could not be done, for every other failure
   */
  public static from(error: unknown, permission: string, message: string): DeviceButlerError {
    if (error instanceof DeviceButlerError) {
      return error
    }

    return SharingErrorFactory.nameOf(error) === 'NotAllowedError'
      ? new PermissionDeniedError(permission, { cause: error })
      : new SharingError(message, { cause: error })
  }

  /**
   * Whether the user closed what the browser showed without choosing anything.
   */
  public static isCancellation(error: unknown): boolean {
    return SharingErrorFactory.nameOf(error) === 'AbortError'
  }

  private static nameOf(error: unknown): unknown {
    return typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined
  }
}
