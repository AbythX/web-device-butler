import type { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../../core/errors/unsupported-error.ts'
import type { CodePoint } from '../model/detected-code.ts'

/**
 * The part of the picture to look at, as fractions of its width and height: `{ x: 0.25, y: 0.25, width: 0.5,
 * height: 0.5 }` is the middle. Codes outside it are not found, and a smaller part is read faster.
 */
export interface CodeRegion {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * What a decoder is given: the pixels of the region, and where the region begins in the whole picture.
 */
export interface CodePicture {
  readonly image: ImageData
  readonly offset: CodePoint
}

/**
 * How large a picture is, in pixels.
 */
export interface PictureSize {
  readonly width: number
  readonly height: number
}

/**
 * What a code can be read from: a file the user chose, a decoded image, a canvas, an image or video element of the
 * page, or the pixels themselves.
 */
export type CodeImage = Blob | ImageData | ImageBitmap | HTMLCanvasElement | HTMLImageElement | HTMLVideoElement

/**
 * Draws pictures onto a canvas of its own and reads their pixels back.
 */
export class CodePictures {
  private canvas: HTMLCanvasElement | undefined
  private context: CanvasRenderingContext2D | undefined

  public constructor(private readonly environment: BrowserEnvironment) {}

  /**
   * The pixels of a picture, or of a region of it.
   *
   * @throws UnsupportedError where there is no page to draw on, or the browser cannot decode a file
   */
  public async of(image: CodeImage, region?: CodeRegion): Promise<CodePicture> {
    if (CodePictures.isImageData(image) && region === undefined) {
      return { image, offset: { x: 0, y: 0 } }
    }

    if (CodePictures.isImageData(image)) {
      const bitmap = await this.environment.createImageBitmap(image)

      try {
        return this.draw(bitmap, bitmap.width, bitmap.height, region)
      } finally {
        bitmap.close()
      }
    }

    if (image instanceof Blob) {
      const bitmap = await this.environment.createImageBitmap(image)

      try {
        return this.draw(bitmap, bitmap.width, bitmap.height, region)
      } finally {
        bitmap.close()
      }
    }

    const { width, height } = CodePictures.sizeOf(image)

    return this.draw(image, width, height, region)
  }

  /**
   * Draws the region of the source and reads its pixels.
   *
   * @param width the width of the whole source, in pixels
   * @param height the height of the whole source, in pixels
   */
  public draw(source: CanvasImageSource, width: number, height: number, region?: CodeRegion): CodePicture {
    const x = Math.round(width * (region?.x ?? 0))
    const y = Math.round(height * (region?.y ?? 0))
    const cropWidth = Math.max(1, Math.round(width * (region?.width ?? 1)))
    const cropHeight = Math.max(1, Math.round(height * (region?.height ?? 1)))

    const context = this.contextFor(cropWidth, cropHeight)
    context.drawImage(source, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

    return { image: context.getImageData(0, 0, cropWidth, cropHeight), offset: { x, y } }
  }

  /**
   * Lets go of the canvas.
   */
  public dispose(): void {
    if (this.canvas !== undefined) {
      this.canvas.width = 0
      this.canvas.height = 0
    }

    this.canvas = undefined
    this.context = undefined
  }

  private contextFor(width: number, height: number): CanvasRenderingContext2D {
    if (this.context === undefined || this.canvas === undefined) {
      if (!this.environment.isBrowser) {
        throw new UnsupportedError('document')
      }

      this.canvas = this.environment.document.createElement('canvas')
      // the pixels are read back on every frame
      const context = this.canvas.getContext('2d', { willReadFrequently: true })

      if (context === null) {
        throw new UnsupportedError('CanvasRenderingContext2D')
      }

      this.context = context
    }

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    return this.context
  }

  private static isImageData(image: CodeImage): image is ImageData {
    return 'data' in image && image.data instanceof Uint8ClampedArray
  }

  private static sizeOf(image: Exclude<CodeImage, Blob | ImageData>): PictureSize {
    if ('videoWidth' in image) {
      return { width: image.videoWidth, height: image.videoHeight }
    }

    if ('naturalWidth' in image) {
      return { width: image.naturalWidth, height: image.naturalHeight }
    }

    return { width: image.width, height: image.height }
  }
}
