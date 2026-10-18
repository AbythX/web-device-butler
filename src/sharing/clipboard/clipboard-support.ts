import type { BrowserEnvironment, ClipboardItemFactory } from '../../core/environment/browser-environment.ts'

/**
 * Whether the page can copy to the clipboard and read from it. Shared by the clipboard and by the request of the
 * permission to read it, so both say the same.
 */
export class ClipboardSupport {
  /** what every browser that copies data can copy, for the ones that cannot be asked */
  private static readonly commonTypes: readonly string[] = ['text/plain', 'text/html', 'image/png']

  /**
   * `false` outside a secure context and where the browser gives pages no clipboard.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return ClipboardSupport.resolveFor(environment) !== undefined
  }

  /**
   * Whether the page can read text from the clipboard.
   */
  public static canReadIn(environment: BrowserEnvironment): boolean {
    return typeof ClipboardSupport.resolveFor(environment)?.readText === 'function'
  }

  /**
   * Whether the page can copy data of the type, such as `image/png`.
   */
  public static canWriteIn(environment: BrowserEnvironment, type: string): boolean {
    const ClipboardItem = ClipboardSupport.resolveItemFor(environment)

    if (ClipboardItem === undefined || typeof ClipboardSupport.resolveFor(environment)?.write !== 'function') {
      return false
    }

    return typeof ClipboardItem.supports === 'function'
      ? ClipboardItem.supports(type)
      : ClipboardSupport.commonTypes.includes(type)
  }

  /**
   * The clipboard of the system where the page may use it; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): Clipboard | undefined {
    return environment.secured(environment.clipboard)
  }

  /**
   * What copied data is wrapped in, where the page may copy data; `undefined` where it only copies text.
   */
  public static resolveItemFor(environment: BrowserEnvironment): ClipboardItemFactory | undefined {
    return environment.secured(environment.ClipboardItem)
  }
}
