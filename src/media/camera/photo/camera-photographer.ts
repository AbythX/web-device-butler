import type { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../../core/errors/unsupported-error.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import { MediaError } from '../../errors/media-error.ts'
import type { CameraPhotoOptions } from './camera-photo-options.ts'

/**
 * Takes a photo with a running camera. Some browsers can ask the camera for a still picture; everywhere else the
 * photo is the picture of the stream at that moment.
 */
export class CameraPhotographer {
  private static readonly defaultType = 'image/jpeg'
  private static readonly defaultQuality = 0.92

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {}

  /**
   * @param stream the stream of the running camera
   * @throws UnsupportedError where there is no page to draw the picture on
   * @throws MediaError if the camera delivers no picture
   */
  public async take(stream: MediaStream, options: CameraPhotoOptions = {}): Promise<Blob> {
    const [track] = stream.getVideoTracks()
    const ImageCapture = this.environment.secureContext?.ImageCapture

    if (options.source !== 'frame' && ImageCapture !== undefined && track !== undefined) {
      try {
        return await new ImageCapture(track).takePhoto()
      } catch (error) {
        this.logger.debug('The camera took no still picture, using the picture of the stream', error)
      }
    }

    return this.frame(stream, options)
  }

  /**
   * The picture of the stream, drawn from a video element that is never added to the page.
   */
  private async frame(stream: MediaStream, options: CameraPhotoOptions): Promise<Blob> {
    if (!this.environment.isBrowser) {
      throw new UnsupportedError('document')
    }

    const { document } = this.environment
    const video = document.createElement('video')

    try {
      video.muted = true
      // without it a phone opens its own player for the video
      video.playsInline = true
      video.srcObject = stream
      await video.play()

      if (video.videoWidth === 0) {
        await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }))
      }

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const context = canvas.getContext('2d')

      if (context === null || canvas.width === 0 || canvas.height === 0) {
        throw new MediaError('The camera delivers no picture to take a photo of')
      }

      context.drawImage(video, 0, 0)

      return await CameraPhotographer.encode(canvas, options)
    } catch (error) {
      throw error instanceof MediaError ? error : new MediaError('Could not take a photo', { cause: error })
    } finally {
      video.pause()
      video.srcObject = null
    }
  }

  private static encode(canvas: HTMLCanvasElement, options: CameraPhotoOptions): Promise<Blob> {
    const { type = CameraPhotographer.defaultType, quality = CameraPhotographer.defaultQuality } = options

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob === null) {
            reject(new MediaError(`The browser could not write the photo as '${type}'`))
          } else {
            resolve(blob)
          }
        },
        type,
        quality
      )
    })
  }
}
