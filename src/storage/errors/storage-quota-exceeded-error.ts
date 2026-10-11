import type { StorageSpace } from '../space/storage-space.ts'
import { StorageError } from './storage-error.ts'

/**
 * A write did not fit. For `localStorage` and `sessionStorage` this is the only reliable signal that they are full.
 */
export class StorageQuotaExceededError extends StorageError {
  public constructor(
    message: string,
    /** the space of the origin at the time of the failure, `undefined` if it could not be read */
    public readonly space?: StorageSpace,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'StorageQuotaExceededError'
  }
}
