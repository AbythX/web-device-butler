import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { DisplayMediaCapture } from '../../core/environment/display-media-like.ts'

/**
 * Whether the page can capture the screen. Shared by `isSupported` and `open()` of the capture, so both say the same.
 */
export class ScreenCaptureSupport {
  /**
   * `false` outside a secure context and where the browser cannot capture the screen, as on phones.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return ScreenCaptureSupport.resolveFor(environment) !== undefined
  }

  /**
   * The capture of the screen (`getDisplayMedia`) where the page may use it; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): DisplayMediaCapture | undefined {
    return environment.secured(environment.displayMedia)
  }
}
