import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'

/**
 * The user or the browser refused the permission. Asking again shows no prompt in most browsers; the user has to
 * unblock the permission in the settings of the browser.
 */
export class PermissionDeniedError extends DeviceButlerError {
  /**
   * @param permission what was refused: `camera`, `microphone`, `geolocation`, ...
   */
  public constructor(
    public readonly permission: string,
    options?: ErrorOptions
  ) {
    super(`The permission for '${permission}' was denied`, options)
    this.name = 'PermissionDeniedError'
  }
}
