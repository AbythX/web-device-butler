import { StorageError } from './storage-error.ts'

/**
 * The browser refused access to the backend, for example in private mode or for blocked third-party storage.
 */
export class StorageAccessDeniedError extends StorageError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'StorageAccessDeniedError'
  }
}
