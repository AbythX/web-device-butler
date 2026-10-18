/**
 * A code that the code detector of the browser found.
 */
export interface DetectedBarcodeLike {
  readonly format: string
  readonly rawValue: string
  /** clockwise from the top left, in the pixels of the image */
  readonly cornerPoints: readonly { readonly x: number; readonly y: number }[]
}

/**
 * The code detector of the browser (`BarcodeDetector`), which only some browsers have. The DOM types do not know it.
 */
export interface BarcodeDetectorLike {
  detect(image: ImageBitmapSource): Promise<DetectedBarcodeLike[]>
}

/**
 * The constructor of the code detector, and what it can read in this browser.
 */
export interface BarcodeDetectorFactory {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats(): Promise<string[]>
}
