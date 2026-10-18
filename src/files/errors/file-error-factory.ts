import { BrowserError } from '../../core/errors/browser-error.ts'
import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { FileError } from './file-error.ts'

/**
 * The single place that turns what the browser throws when saving a file into the errors of the library.
 */
export class FileErrorFactory {
  /**
   * @param action what could not be done, used as the message: "Could not write the file 'report.pdf'"
   */
  public static from(error: unknown, action: string): DeviceButlerError {
    return error instanceof DeviceButlerError ? error : new FileError(action, { cause: error })
  }

  /**
   * Whether the user closed the save dialog without choosing where to save.
   */
  public static isCancellation(error: unknown): boolean {
    return BrowserError.isCancellation(error)
  }
}
