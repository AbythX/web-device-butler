import type { CodePicture, CodeRegion } from '../frames/code-picture.ts'
import type { FrameGrabber } from '../frames/frame-grabber.ts'

/**
 * Pixels for specs, which run where there is no `ImageData`.
 */
export const fakeImageData = (width = 4, height = 4): ImageData =>
  ({ data: new Uint8ClampedArray(width * height * 4), width, height, colorSpace: 'srgb' }) as ImageData

/**
 * A frame grabber for specs: every picture is empty pixels, taken from a picture of 1000 by 1000 pixels.
 */
export class FakeFrameGrabber implements FrameGrabber {
  public readonly grabbed: { stream: MediaStream; region?: CodeRegion }[] = []
  public isDisposed = false
  /** the stream has no picture yet */
  public isEmpty = false

  public grab(stream: MediaStream, region?: CodeRegion): Promise<CodePicture | undefined> {
    this.grabbed.push({ stream, region })

    if (this.isEmpty) {
      return Promise.resolve(undefined)
    }

    const offset = { x: Math.round(1000 * (region?.x ?? 0)), y: Math.round(1000 * (region?.y ?? 0)) }

    return Promise.resolve({ image: fakeImageData(), offset })
  }

  public [Symbol.dispose](): void {
    this.isDisposed = true
  }
}
