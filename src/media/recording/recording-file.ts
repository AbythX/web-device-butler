import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { WebmDuration } from './webm/webm-duration.ts'

/**
 * Puts the pieces of one segment together as a file a player can read.
 */
export class RecordingFile {
  /**
   * A recorder cannot write the length into a WebM file, which leaves players unable to show it or to jump to a
   * position, so it is written into it here.
   *
   * @param duration the length of the segment, in milliseconds
   */
  public static async of(
    parts: BlobPart[],
    mimeType: string,
    duration: number,
    environment: BrowserEnvironment,
    logger: Logger
  ): Promise<Blob> {
    const file = environment.createBlob(parts, mimeType)

    if (!/^(audio|video)\/webm/i.test(mimeType)) {
      return file
    }

    try {
      return await WebmDuration.apply(file, duration, (pieces, type) => environment.createBlob(pieces, type))
    } catch (error) {
      logger.debug('Could not write the length into the recording', error)

      return file
    }
  }
}
