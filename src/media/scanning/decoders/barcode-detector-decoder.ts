import type {
  BarcodeDetectorFactory,
  BarcodeDetectorLike,
  DetectedBarcodeLike,
} from '../../../core/environment/barcode-detector-like.ts'
import { type CodeFormat, isCodeFormat } from '../model/code-format.ts'
import type { DetectedCode } from '../model/detected-code.ts'
import type { CodeDecoder } from './code-decoder.ts'

/**
 * Reads codes with the code detector of the browser (`BarcodeDetector`). Chromium has one on Android, macOS and
 * ChromeOS; Firefox and Safari have none.
 */
export class BarcodeDetectorDecoder implements CodeDecoder {
  public readonly name = 'BarcodeDetector'

  private supported: Promise<readonly CodeFormat[]> | undefined
  /** one detector per set of formats, because a detector is told its formats when it is created */
  private readonly detectors = new Map<string, BarcodeDetectorLike>()

  public constructor(private readonly BarcodeDetector: BarcodeDetectorFactory) {}

  public formats(): Promise<readonly CodeFormat[]> {
    this.supported ??= this.BarcodeDetector.getSupportedFormats().then((formats) => formats.filter(isCodeFormat))

    return this.supported
  }

  public async decode(image: ImageData, formats?: readonly CodeFormat[]): Promise<DetectedCode[]> {
    const supported = await this.formats()
    // a detector that is asked for a format it cannot read is not created at all
    const wanted = formats === undefined ? supported : formats.filter((format) => supported.includes(format))

    if (wanted.length === 0) {
      return []
    }

    const found = await this.detectorFor(wanted).detect(image)

    return found.flatMap((barcode) => BarcodeDetectorDecoder.codeOf(barcode))
  }

  private detectorFor(formats: readonly CodeFormat[]): BarcodeDetectorLike {
    const key = [...formats].sort().join(',')
    let detector = this.detectors.get(key)

    if (detector === undefined) {
      detector = new this.BarcodeDetector({ formats: [...formats] })
      this.detectors.set(key, detector)
    }

    return detector
  }

  private static codeOf({ format, rawValue, cornerPoints }: DetectedBarcodeLike): DetectedCode[] {
    return isCodeFormat(format)
      ? [{ format, value: rawValue, corners: cornerPoints.map(({ x, y }) => ({ x, y })) }]
      : []
  }
}
