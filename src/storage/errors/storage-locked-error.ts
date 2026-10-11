import { StorageError } from './storage-error.ts'

/**
 * The entry is in use, in this tab or another, and the call was made with `{ wait: false }`.
 */
export class StorageLockedError extends StorageError {
  public constructor(
    public readonly key: string,
    options?: ErrorOptions
  ) {
    super(`The entry '${key}' is in use`, options)
    this.name = 'StorageLockedError'
  }
}
