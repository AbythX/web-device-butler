import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'

/**
 * The browser could not hand something over to another application, through the share sheet of the system or the
 * clipboard. The error of the browser is kept as `cause`.
 */
export class SharingError extends DeviceButlerError {
  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SharingError'
  }
}
