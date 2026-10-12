import type { PageVisibility } from '../../core/environment/page-visibility.ts'
import type { MediaAccess } from '../access/media-access.ts'
import type { MediaInputManager } from '../input/media-input-manager.ts'
import type { PlatformQuirk } from '../quirks/platform-quirk.ts'
import type { CameraPreparation } from './camera-preparation.ts'
import type { CameraCapabilityReader } from './discovery/camera-capability-reader.ts'
import type { CameraProbeCache } from './discovery/camera-probe-cache.ts'
import type { CameraProber } from './discovery/camera-prober.ts'
import type { CameraSelector } from './discovery/camera-selector.ts'
import type { CameraTiming } from './discovery/camera-timing.ts'
import type { CameraDescriptor } from './model/camera-descriptor.ts'
import type { CameraRequirements } from './model/camera-requirements.ts'
import type { CameraPhotographer } from './photo/camera-photographer.ts'
import type { CameraSession } from './session/camera-session.ts'

export interface CameraListOptions {
  /**
   * `probed` requests access and starts every camera that was not looked at yet, to find out what it can do.
   * Without it nothing is requested and nothing is started.
   */
  detail?: 'probed'
}

/**
 * What a camera manager works with. `DefaultDeviceButler.create()` and `DefaultCameraManager.create()` build these.
 */
export interface CameraManagerParts {
  /** the access gate of the cameras */
  readonly gate: MediaAccess
  readonly reader: CameraCapabilityReader
  readonly prober: CameraProber
  readonly cache: CameraProbeCache
  readonly selector: CameraSelector
  readonly visibility: PageVisibility
  /** takes the photos of the sessions */
  readonly photographer: CameraPhotographer
  /** the quirks a new session is composed with */
  quirks(): PlatformQuirk[]
  readonly timing?: CameraTiming
}

/**
 * The entry to the cameras (`butler.camera`): finds out which cameras there are and what they can do, selects one
 * by the features an application needs and opens sessions.
 */
export interface CameraManager extends MediaInputManager<CameraDescriptor, CameraSession, CameraRequirements> {
  /**
   * The cameras. Without options it never prompts and never starts a camera: the list is empty until access was
   * requested, and it says about each camera what is known without starting it, plus what is remembered from
   * earlier visits.
   *
   * @throws MediaDeviceBusyError with `detail: 'probed'`, if the cameras are held, nothing is remembered about them
   *   and the busy policy does not get them
   */
  list(options?: CameraListOptions): Promise<CameraDescriptor[]>

  /**
   * Does the slow and visible work up front, so an application can run it on a set-up screen instead of when the
   * user presses record: requests access, looks at the cameras the requirements can match and says which camera
   * `open()` would start. No camera runs afterwards. Calling it again is cheap.
   *
   * It reports instead of throwing, except for a call that was aborted through its signal.
   */
  prepare(requirements?: Partial<CameraRequirements>): Promise<CameraPreparation>

  /**
   * Forgets what is remembered about the cameras. The next call that needs to know looks at them again.
   */
  forget(): Promise<void>
}
