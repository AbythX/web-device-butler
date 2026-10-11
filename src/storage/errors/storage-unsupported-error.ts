import { StorageError } from './storage-error.ts'

/**
 * The backend, or the requested operation on it, is not available in this browser.
 */
export class StorageUnsupportedError extends StorageError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'StorageUnsupportedError'
  }
}
