import { StorageError } from './storage-error.ts'

/**
 * The entry was written in a newer format than this version of the library knows, typically by another tab that
 * already runs a newer version of the application. It is left untouched.
 */
export class StorageVersionError extends StorageError {
  public constructor(
    public readonly key: string,
    public readonly found: number,
    public readonly supported: number
  ) {
    super(`The entry '${key}' has the format version ${found}, this version only reads up to ${supported}`)
    this.name = 'StorageVersionError'
  }
}
