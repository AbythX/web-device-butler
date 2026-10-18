import { BrowserError } from '../../core/errors/browser-error.ts'
import { StorageAccessDeniedError } from './storage-access-denied-error.ts'
import { StorageError } from './storage-error.ts'
import { StorageQuotaExceededError } from './storage-quota-exceeded-error.ts'

/**
 * The single place that turns what a backend throws into the errors of the library, so the names of `DOMException`
 * never reach the application.
 */
export class StorageErrorFactory {
  private static readonly quotaNames = ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']
  private static readonly accessNames = ['SecurityError', 'NotAllowedError', 'InvalidAccessError']

  /**
   * @param action what was attempted, used as the message: "Could not write 'settings'"
   */
  public static from(error: unknown, action: string): StorageError {
    if (error instanceof StorageError) {
      return error
    }

    const name = BrowserError.nameOf(error)

    if (StorageErrorFactory.quotaNames.includes(name)) {
      return new StorageQuotaExceededError(`${action}: the storage is full`, undefined, { cause: error })
    }

    if (StorageErrorFactory.accessNames.includes(name)) {
      return new StorageAccessDeniedError(`${action}: access was denied`, { cause: error })
    }

    return new StorageError(action, { cause: error })
  }

  /**
   * Whether the browser failed because a file or directory does not exist.
   */
  public static isNotFound(error: unknown): boolean {
    return BrowserError.hasName(error, 'NotFoundError')
  }
}
