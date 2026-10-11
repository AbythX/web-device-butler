import { DeviceError } from '../../core/errors/device-error.ts'

/**
 * The base of every error of the camera and the microphone. It is thrown itself for failures that fit none of the
 * more specific errors; the original error is kept as `cause`.
 */
export class MediaError extends DeviceError {
  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MediaError'
  }
}
