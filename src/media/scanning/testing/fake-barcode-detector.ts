import type { BarcodeDetectorLike, DetectedBarcodeLike } from '../../../core/environment/barcode-detector-like.ts'

/**
 * `BarcodeDetector` for specs: it finds what {@link codes} holds, in every picture, and records how it is used.
 */
export class FakeBarcodeDetector implements BarcodeDetectorLike {
  /** what this browser can read; like Chromium, more than the library knows */
  public static supported: string[] = ['qr_code', 'ean_13', 'code_128', 'unknown']
  /** found in every picture */
  public static codes: DetectedBarcodeLike[] = []
  /** the formats every detector was created with */
  public static readonly created: string[][] = []
  public static detections = 0

  public static reset(): void {
    FakeBarcodeDetector.supported = ['qr_code', 'ean_13', 'code_128', 'unknown']
    FakeBarcodeDetector.codes = []
    FakeBarcodeDetector.created.splice(0)
    FakeBarcodeDetector.detections = 0
  }

  public static getSupportedFormats(): Promise<string[]> {
    return Promise.resolve([...FakeBarcodeDetector.supported])
  }

  public constructor(options: { formats?: string[] } = {}) {
    const formats = options.formats ?? []

    // like a browser: a format it cannot read is refused
    if (formats.some((format) => !FakeBarcodeDetector.supported.includes(format))) {
      throw new TypeError(`Unsupported format in ${formats.join(', ')}`)
    }

    FakeBarcodeDetector.created.push(formats)
  }

  public detect(): Promise<DetectedBarcodeLike[]> {
    FakeBarcodeDetector.detections++

    return Promise.resolve([...FakeBarcodeDetector.codes])
  }
}
