import { StorageError } from './storage-error.ts'

/**
 * A value could not be encoded for the backend, or what the backend holds could not be decoded. The latter also
 * happens for entries that were not written by this library.
 */
export class StorageCodecError extends StorageError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'StorageCodecError'
  }
}
