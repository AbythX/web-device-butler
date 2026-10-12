import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'

/**
 * The base of every error of the storage module. It is thrown itself for failures of a backend that fit none of the
 * more specific errors; the original error is kept as `cause`.
 */
export class StorageError extends DeviceButlerError {
  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'StorageError'
  }
}
