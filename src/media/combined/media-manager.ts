import type { CameraRequirements } from '../camera/model/camera-requirements.ts'
import type { MicrophoneRequirements } from '../microphone/model/microphone-requirements.ts'
import type { CombinedMediaSession } from './combined-media-session.ts'

/**
 * What a combined session is opened with. Each part overrides single fields of the configuration of its device,
 * the way the argument of `butler.camera.open()` and `butler.microphone.open()` does.
 */
export interface CombinedMediaRequirements {
  camera?: Partial<CameraRequirements>
  microphone?: Partial<MicrophoneRequirements>
}

/**
 * Opens a camera and a microphone together (`butler.media`).
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
}
