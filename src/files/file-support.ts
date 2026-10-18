import type { BrowserEnvironment, SaveFilePicker } from '../core/environment/browser-environment.ts'

/**
 * Whether the page can save files to the device and take files from it. Shared by every call of the files, so all say
 * the same.
 */
export class FileSupport {
  /**
   * `false` outside a secure context and where the browser has no save dialog; the files are downloaded then.
   */
  public static canChooseWhereToSaveIn(environment: BrowserEnvironment): boolean {
    return FileSupport.resolveFor(environment) !== undefined
  }

  /**
   * Whether the page can hand a file to the browser as a download, which needs a page.
   */
  public static canSaveIn(environment: BrowserEnvironment): boolean {
    return environment.isBrowser
  }

  /**
   * Whether the page can let the user pick files, which needs a page.
   */
  public static canPickIn(environment: BrowserEnvironment): boolean {
    return environment.isBrowser
  }

  /**
   * The save dialog of the browser where the page may show it; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): SaveFilePicker | undefined {
    return environment.secured(environment.saveFilePicker)
  }
}
