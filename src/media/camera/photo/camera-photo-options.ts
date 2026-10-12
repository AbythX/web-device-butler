/**
 * How a photo is taken.
 */
export interface CameraPhotoOptions {
  /**
   * - `photo` (default): a still picture taken by the camera where the browser can ask it for one, which can be
   *   larger than the picture of the stream; otherwise the picture of the stream.
   * - `frame`: always the picture of the stream, exactly what a preview shows at that moment.
   */
  source?: 'photo' | 'frame'
  /**
   * The format of a picture of the stream: `image/jpeg` (default), `image/png` or `image/webp`. A still picture
   * taken by the camera comes in the format the camera delivers, which is JPEG on most devices.
   */
  type?: string
  /** how well a JPEG or WebP picture of the stream keeps the details, from 0 to 1; default: `0.92` */
  quality?: number
}
