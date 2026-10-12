import type { BrowserEnvironment } from './browser-environment.ts'

/**
 * Whether the user can see the page. Browsers pause or end devices of a page that is in the background.
 */
export class PageVisibility {
  public constructor(private readonly environment: BrowserEnvironment) {}

  /**
   * Resolves once the page is visible, which is at once if it is visible already.
   */
  public whenVisible(): Promise<void> {
    const document = this.document

    if (document === undefined || document.visibilityState !== 'hidden') {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      const listener = () => {
        if (document.visibilityState !== 'hidden') {
          document.removeEventListener('visibilitychange', listener)
          resolve()
        }
      }

      document.addEventListener('visibilitychange', listener)
    })
  }

  private get document(): Document | undefined {
    return this.environment.isBrowser ? this.environment.document : undefined
  }
}
