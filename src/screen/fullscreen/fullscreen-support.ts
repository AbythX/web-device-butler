import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'

/**
 * The calls the document can have to fill the screen with an element: the standard ones and the ones older browsers
 * have under a prefix.
 */
export interface FullscreenDocument {
  fullscreenEnabled?: boolean
  webkitFullscreenEnabled?: boolean
  fullscreenElement?: Element | null
  webkitFullscreenElement?: Element | null
  exitFullscreen?(): Promise<void>
  webkitExitFullscreen?(): Promise<void> | void
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

/**
 * Whether the page can fill the screen with an element. Shared by every call of the fullscreen, so all say the same.
 */
export class FullscreenSupport {
  /**
   * `false` without a page, where the browser does not allow it, as in a frame without `allowfullscreen`, and where
   * the document cannot leave the fullscreen again. Filling the screen also works outside a secure context, so it is
   * not checked.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    const document = FullscreenSupport.resolveFor(environment)

    return (
      document !== undefined &&
      (document.fullscreenEnabled ?? document.webkitFullscreenEnabled) !== false &&
      (typeof document.exitFullscreen === 'function' || typeof document.webkitExitFullscreen === 'function')
    )
  }

  /**
   * The document of the page; `undefined` without a page.
   */
  public static resolveFor(environment: BrowserEnvironment): FullscreenDocument | undefined {
    return environment.isBrowser ? environment.document : undefined
  }
}
