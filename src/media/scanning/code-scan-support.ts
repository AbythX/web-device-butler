import type { BarcodeDetectorFactory } from '../../core/environment/barcode-detector-like.ts'
import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'

/**
 * Whether the browser can read codes on its own, without a decoder of the application. Shared by `isSupported` and by
 * the choice of the decoder, so both say the same.
 */
export class CodeScanSupport {
  /**
   * `false` outside a secure context and where the browser has no `BarcodeDetector`.
   */
  public static hasBuiltInDecoderIn(environment: BrowserEnvironment): boolean {
    return CodeScanSupport.resolveFor(environment) !== undefined
  }

  /**
   * The decoder of the browser where the page may use it; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): BarcodeDetectorFactory | undefined {
    return environment.secured(environment.BarcodeDetector)
  }
}
