import type { CodeFormat } from '../model/code-format.ts'
import type { DetectedCode } from '../model/detected-code.ts'

/**
 * Reads codes in a picture. The library brings one for the code detector of the browser; the entry point
 * `web-device-butler/zxing` brings one for every browser. An application adds its own by implementing this.
 */
export interface CodeDecoder {
  /** for the log */
  readonly name: string

  /**
   * The kinds of codes it can read here. Empty where it can read none, as the code detector of Chromium on a
   * desktop that has no reader for it.
   */
  formats(): Promise<readonly CodeFormat[]>

  /**
   * The codes in the picture. It never rejects for a picture without a code; that is an empty list.
   *
   * @param formats the kinds of codes to look for; default: every kind it can read
   */
  decode(image: ImageData, formats?: readonly CodeFormat[]): Promise<DetectedCode[]>
}
