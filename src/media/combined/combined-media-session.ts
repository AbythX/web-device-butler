import type { Listenable } from '../../core/events/listenable.ts'

import type { CameraSession } from '../camera/session/camera-session.ts'
import type { MicrophoneSession } from '../microphone/session/microphone-session.ts'
import type { MediaSessionEnd, MediaSessionState } from '../session/media-session.ts'

export interface CombinedMediaSessionEnd extends MediaSessionEnd {
  /** the device that ended first and took the other one with it; not set if the application closed the session */
  readonly source?: 'camera' | 'microphone'
}

export interface CombinedMediaSessionEvents {
  statechange: MediaSessionState
  /** emitted once, when both devices are free for others again */
  ended: CombinedMediaSessionEnd
}

/**
 * A camera and a microphone that run together and deliver one stream, for recording a picture with its sound.
 *
 * The session owns a camera session and a microphone session. Each can be used on its own (`camera.torch`,
 * `microphone.processing`); they end together: when one of them ends, for whatever reason, the other is closed.
 */
export interface CombinedMediaSession extends Listenable<CombinedMediaSessionEvents>, AsyncDisposable {
  /** the session of the camera, for its torch, zoom and focus */
  readonly camera: CameraSession

  /** the session of the microphone, for its processing and level */
  readonly microphone: MicrophoneSession

  /**
   * The picture and the sound in one stream, for `<video>.srcObject` or `MediaRecorder`. It stays the same object
   * when a device is started again.
   */
  readonly stream: MediaStream

  /**
   * `live` while both devices deliver, `muted` while the system paused one of them, `ended` once one has ended.
   */
  readonly state: MediaSessionState

  /**
   * Whether another tab may take the devices away with `whenBusy: 'takeover'`.
   */
  allowTakeover: boolean

  /**
   * Stops both devices and releases them. Closing a session that has ended does nothing.
   */
  close(): Promise<void>
}
