import type { MediaSession, MediaSessionEvents } from '../../session/media-session.ts'
import type { DisplaySurface } from '../model/screen-capture-requirements.ts'
import type { ScreenCaptureSettings } from '../model/screen-capture-settings.ts'

export interface ScreenCaptureSessionEvents extends MediaSessionEvents {
  /** the capture delivers another size or frame rate than before, for example after the shared window was resized */
  settingschange: ScreenCaptureSettings
}

/**
 * What can be changed while the screen is captured.
 */
export interface ScreenCaptureChanges {
  /** in pixels */
  width?: number
  /** in pixels */
  height?: number
  /** frames per second */
  frameRate?: number
}

/**
 * One running capture of what the user chose to share. It ends with `device` when the user stops sharing through the
 * browser or the system, and no other tab can take it over.
 */
export interface ScreenCaptureSession extends MediaSession<ScreenCaptureSessionEvents> {
  /**
   * What the user chose; `undefined` where the browser does not say.
   */
  readonly surface: DisplaySurface | undefined

  /**
   * The track of the sound, if the user shared it. The picture is {@link track}; both are in {@link stream}.
   */
  readonly audio: MediaStreamTrack | undefined

  /**
   * What the capture delivers, read from the browser on every access.
   */
  readonly settings: ScreenCaptureSettings

  /**
   * Changes the width, the height or the frame rate of the capture, which delivers the closest it can do.
   * `settings` says what the browser made of it.
   *
   * @throws SessionClosedError if the session has ended
   */
  configure(changes: ScreenCaptureChanges): Promise<void>
}
