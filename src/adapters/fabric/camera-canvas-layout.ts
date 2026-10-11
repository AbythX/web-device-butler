export interface Dimensions {
  readonly width: number
  readonly height: number
}

/**
 * How a camera picture fills a display area: the picture keeps its resolution and is cropped to the shape of the
 * area, so what is recorded from the canvas is as sharp as the camera delivers it.
 *
 * @see https://stackoverflow.com/a/6565988
 */
export class CameraCanvasLayout {
  private constructor(
    /** the size of the drawing surface, in pixels of the camera */
    public readonly surface: Dimensions,
    /** the size the canvas is displayed at */
    public readonly display: Dimensions,
    /** by how much what is drawn over the picture has to grow to keep its size on the display */
    public readonly overlayScale: number
  ) {}

  /**
   * @param source the size of the camera picture
   * @param display the area the picture is shown in
   * @returns `undefined` while one of the sizes is not known yet, which would turn the ratios into nonsense
   */
  public static fit(source: Dimensions, display: Dimensions): CameraCanvasLayout | undefined {
    if (source.width <= 0 || source.height <= 0 || display.width <= 0 || display.height <= 0) {
      return undefined
    }

    const round = CameraCanvasLayout.round
    const sourceWidth = round(source.width, 2)
    const sourceHeight = round(source.height, 2)

    const isPictureWider = round(sourceWidth / sourceHeight, 2) > round(display.width / display.height, 2)

    const surface = {
      width: round(isPictureWider ? (display.width * sourceHeight) / display.height : sourceWidth),
      height: round(isPictureWider ? sourceHeight : (display.height * sourceWidth) / display.width),
    }

    const overlayScale = Math.max(round(surface.width / display.width, 2), round(surface.height / display.height, 2))

    return new CameraCanvasLayout(surface, { width: display.width, height: display.height }, overlayScale)
  }

  private static round(value: number, digits = 0): number {
    const factor = 10 ** digits

    return Math.round(value * factor) / factor
  }
}
