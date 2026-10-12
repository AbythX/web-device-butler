import type { MediaLease } from '../../access/media-lease.ts'
import type { MediaInputStart } from '../../input/media-input-manager.ts'
import type { MediaSession, MediaSessionEvents } from '../../session/media-session.ts'
import type { FocusControl } from '../controls/focus-control.ts'
import type { TorchControl } from '../controls/torch-control.ts'
import type { ZoomControl } from '../controls/zoom-control.ts'
import type { CameraDescriptor } from '../model/camera-descriptor.ts'
import type { CameraRequirements } from '../model/camera-requirements.ts'
import type { CameraSettings } from '../model/camera-settings.ts'
import type { CameraPhotoOptions } from '../photo/camera-photo-options.ts'

export interface CameraSessionEvents extends MediaSessionEvents {
  /** the camera delivers another resolution or frame rate than before */
  settingschange: CameraSettings
  /** the session continues with another camera */
  devicechange: CameraDescriptor
}

/**
 * What can be changed while the camera runs.
 */
export interface CameraSessionChanges {
  /** in pixels */
  width?: number
  /** in pixels */
  height?: number
  /** frames per second */
  frameRate?: number
}

/**
 * What a session needs from the manager that created it.
 */
export interface CameraSessionHost {
  /** chooses the camera that fits the requirements and starts it on the lease, which stops the running one */
  restart(requirements: CameraRequirements, lease: MediaLease): Promise<MediaInputStart<CameraDescriptor>>
  /** the requirements with the fields of the changes that are set */
  merge(requirements: CameraRequirements, changes: Partial<CameraRequirements>): CameraRequirements
  /** resolves once the user can see the page */
  whenVisible(): Promise<void>
  /** takes a photo with the camera that delivers the stream */
  photograph(stream: MediaStream, options?: CameraPhotoOptions): Promise<Blob>
}

/**
 * One running camera. The session is the same on every platform; what a platform needs is in the quirks it is
 * composed with.
 */
export interface CameraSession extends MediaSession<CameraSessionEvents> {
  /**
   * The camera the session runs right now.
   */
  readonly descriptor: CameraDescriptor

  /**
   * What the camera delivers, read from the camera on every access.
   */
  readonly settings: CameraSettings

  /**
   * `undefined` if the camera has no torch.
   */
  readonly torch: TorchControl | undefined

  /**
   * `undefined` if the camera cannot zoom.
   */
  readonly zoom: ZoomControl | undefined

  /**
   * `undefined` if the application cannot focus the camera.
   */
  readonly focus: FocusControl | undefined

  /**
   * Changes the width, the height or the frame rate of the running camera, which delivers the closest it can do.
   * `settings` says what the camera made of it. The session prefers the new values from then on.
   *
   * @throws SessionClosedError if the session has ended
   */
  configure(changes: CameraSessionChanges): Promise<void>

  /**
   * Continues with the camera that fits the requirements: the same session, a new track and a new `stream`. The
   * requirements are merged over the ones the session runs with; the `id` is not kept.
   *
   * The running camera is stopped first, because a phone cannot run two; until the next one runs, the session is
   * `muted`. If no camera fits, the session returns to the camera it had; if that does not start either, the session
   * ends. A session that lands on the camera it had continues with its torch, zoom and focus.
   *
   * @throws MediaRequirementsError if no camera fits
   * @throws SessionClosedError if the session has ended
   */
  switchTo(requirements: Partial<CameraRequirements>): Promise<void>

  /**
   * Takes a photo. Where the browser can ask the camera for a still picture, that is the photo: it can be larger
   * than the picture of the stream, and the camera may adjust its exposure for it. Everywhere else, and with
   * `source: 'frame'`, the photo is the picture of the stream at that moment.
   *
   * The session keeps running. A photo is not taken while the camera is switched or started again.
   *
   * @throws SessionClosedError if the session has ended
   * @throws MediaError if the camera delivers no picture
   * @throws UnsupportedError where there is no page to draw the picture of the stream on
   */
  takePhoto(options?: CameraPhotoOptions): Promise<Blob>
}
