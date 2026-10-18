import type { CodePicture, CodeRegion } from './code-picture.ts'

/**
 * Takes the picture a stream shows right now.
 */
export interface FrameGrabber extends Disposable {
  /**
   * @param stream what is shown; a session that continues with a new stream is followed
   * @returns `undefined` while the stream has no picture yet
   */
  grab(stream: MediaStream, region?: CodeRegion): Promise<CodePicture | undefined>
}
