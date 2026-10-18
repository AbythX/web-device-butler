import type { CameraRequirements } from '../camera/model/camera-requirements.ts'
import type { MicrophoneRequirements } from '../microphone/model/microphone-requirements.ts'
import type { MediaSession } from '../session/media-session.ts'
import type { CombinedMediaSession } from './combined-media-session.ts'
import type { JoinedMediaSource } from './joined-media-source.ts'

/**
 * What a combined session is opened with. Each part overrides single fields of the configuration of its device,
 * the way the argument of `butler.camera.open()` and `butler.microphone.open()` does.
 */
export interface CombinedMediaRequirements {
  camera?: Partial<CameraRequirements>
  microphone?: Partial<MicrophoneRequirements>
}

/**
 * Opens a camera and a microphone together, and joins sessions for one recording (`butler.media`).
 */
export interface MediaManager {
  /**
   * Starts the camera and the microphone that fit the requirements and returns one session that owns both and
   * delivers one stream. If one of them cannot be opened, the other is closed again and the call fails with the
   * error of the device that failed.
   *
   * @throws UnsupportedError where the browser has no media streams
   */
  open(requirements?: CombinedMediaRequirements): Promise<CombinedMediaSession>

  /**
   * Puts the tracks of sessions that are open into one stream, to record them together:
   * `recorder.record(media.join(screen, microphone))`. The source ends when the first of the sessions ends; it does
   * not close the others.
   *
   * @throws SessionClosedError if one of the sessions has ended
   * @throws UnsupportedError where the browser has no media streams
   */
  join(first: MediaSession, ...others: MediaSession[]): JoinedMediaSource
}
