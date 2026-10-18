import type { CodeDecoder } from './decoders/code-decoder.ts'
import type { CodeImage } from './frames/code-picture.ts'
import type { CodeFormat } from './model/code-format.ts'
import type { DetectedCode } from './model/detected-code.ts'
import type { CodeScan, CodeScanOptions, CodeScanSource } from './scan/code-scan.ts'

/**
 * The `scanner` section of the configuration passed to `DefaultDeviceButler.create()`: the defaults of every scan
 * and every `detect()`.
 */
export type CodeScannerConfiguration = CodeScanOptions

/**
 * Reads codes, such as QR codes and the bar codes of products (`butler.scanner`): in the pictures of a camera while
 * it runs, or in a single picture, such as a file the user chose.
 *
 * The codes are read by a decoder. Without one in the configuration, the scanner uses the code detector of the
 * browser, which only Chromium has, and only on some systems. `web-device-butler/zxing` brings a decoder for every
 * browser.
 */
export interface CodeScanner extends Disposable {
  /**
   * Whether there is a decoder: one in the configuration, or the code detector of the browser. {@link formats} says
   * what it can read, which can be nothing.
   */
  readonly isSupported: boolean

  /**
   * The kinds of codes the decoder can read here.
   *
   * @param decoder default: the one `scan()` and `detect()` would use
   */
  formats(decoder?: CodeDecoder): Promise<readonly CodeFormat[]>

  /**
   * Starts to look for codes in the pictures of a session. The options are merged over the configured defaults.
   *
   * ```ts
   * await using scan = butler.scanner.scan(camera, { formats: ['qr_code'] })
   * const code = await scan.next()
   * ```
   *
   * @throws UnsupportedError where there is no decoder
   * @throws SessionClosedError if the session has ended
   */
  scan(source: CodeScanSource, options?: CodeScanOptions): CodeScan

  /**
   * The codes in one picture. A file the user chose is decoded first.
   *
   * @throws UnsupportedError where there is no decoder, or the browser cannot decode the file
   */
  detect(image: CodeImage, options?: Omit<CodeScanOptions, 'rate' | 'repeatAfter'>): Promise<DetectedCode[]>

  /**
   * Stops every scan that runs.
   */
  dispose(): void
}
