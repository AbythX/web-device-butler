import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'

/**
 * A file could not be saved to the device or taken from it. The error of the browser is kept as `cause`.
 */
export class FileError extends DeviceButlerError {
  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'FileError'
  }
}
