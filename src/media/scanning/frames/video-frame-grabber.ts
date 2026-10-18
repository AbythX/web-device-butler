import '../../../core/disposable-polyfill.ts'

import type { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../../core/errors/unsupported-error.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import { CodePictures, type CodePicture, type CodeRegion } from './code-picture.ts'
import type { FrameGrabber } from './frame-grabber.ts'

/**
 * Takes the pictures of a stream from a `<video>` that is never added to the page, the way a photo of the stream is
 * taken.
 */
export class VideoFrameGrabber implements FrameGrabber {
  /** a video has a picture to draw from this ready state on (`HAVE_CURRENT_DATA`) */
  private static readonly hasPicture = 2

  private video: HTMLVideoElement | undefined
  private readonly pictures: CodePictures

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {
    this.pictures = new CodePictures(environment)
  }

  public async grab(stream: MediaStream, region?: CodeRegion): Promise<CodePicture | undefined> {
    const video = this.videoOf(stream)

    if (video.readyState < VideoFrameGrabber.hasPicture || video.videoWidth === 0) {
      return undefined
    }

    return this.pictures.draw(video, video.videoWidth, video.videoHeight, region)
  }

  public [Symbol.dispose](): void {
    if (this.video !== undefined) {
      this.video.pause()
      this.video.srcObject = null
      this.video = undefined
    }

    this.pictures.dispose()
  }

  private videoOf(stream: MediaStream): HTMLVideoElement {
    if (this.video === undefined) {
      if (!this.environment.isBrowser) {
        throw new UnsupportedError('document')
      }

      const video = this.environment.document.createElement('video')
      video.muted = true
      // without it a phone opens its own player for the video
      video.playsInline = true
      this.video = video
    }

    if (this.video.srcObject !== stream) {
      this.video.srcObject = stream
      this.video.play().catch((error: unknown) => this.logger.debug('The video of the scan did not start', error))
    }

    return this.video
  }
}
