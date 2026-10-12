import type { DeviceLocation } from '../location/device-location.ts'
import type { CameraPreparation } from '../media/camera/camera-preparation.ts'
import type { CameraManager } from '../media/camera/camera-manager.ts'
import type { CameraRequirements } from '../media/camera/model/camera-requirements.ts'
import type { MediaManager } from '../media/combined/media-manager.ts'
import type { MicrophonePreparation } from '../media/microphone/microphone-preparation.ts'
import type { MicrophoneManager } from '../media/microphone/microphone-manager.ts'
import type { MicrophoneRequirements } from '../media/microphone/model/microphone-requirements.ts'
import type { PermissionManager } from '../permission/permission-manager.ts'
import type { DeviceOrientation } from '../platform/device-orientation.ts'
import type { DevicePlatform } from '../platform/device-platform.ts'
import type { StorageManager } from '../storage/storage-manager.ts'
import type { TabCoordination } from './coordination/tab-coordination.ts'

/**
 * What `butler.prepare()` prepares. Without options it prepares the devices that have a section in the
 * configuration, and both if neither has one.
 */
export interface DeviceButlerPrepareOptions {
  /** `true` for the configured camera, or requirements that override the configuration for this call */
  camera?: boolean | Partial<CameraRequirements>
  /** `true` for the configured microphone, or requirements that override the configuration for this call */
  microphone?: boolean | Partial<MicrophoneRequirements>
}

/**
 * What `butler.prepare()` found out, per device that was asked for.
 */
export interface DeviceButlerPreparation {
  readonly camera?: CameraPreparation
  readonly microphone?: MicrophonePreparation
}

/**
 * The root object of the library. Every area (storage, camera, microphone, ...) is reached through it.
 */
export interface DeviceButler extends Disposable, AsyncDisposable {
  /** stored data: stores on several backends, the space that is left and persistence */
  readonly storage: StorageManager

  /** finds the cameras, chooses one by its features and opens sessions */
  readonly camera: CameraManager

  /** finds the microphones, chooses one and opens sessions */
  readonly microphone: MicrophoneManager

  /** opens a camera and a microphone together */
  readonly media: MediaManager

  /** what the user has allowed, and asking for it */
  readonly permission: PermissionManager

  /** how far the coordination of shared resources reaches */
  readonly coordination: TabCoordination

  /** where the device is */
  readonly location: DeviceLocation

  /** which system the device runs */
  readonly platform: DevicePlatform

  /** how the device is held */
  readonly orientation: DeviceOrientation

  /**
   * The one explicit, awaited step that does the slow and user-visible work up front: it requests the permissions
   * the configuration needs, looks at the cameras and says which one `open()` would start. An application runs it
   * on a set-up or permission screen. It is optional; `open()` does the same on demand.
   *
   * Without options it prepares the devices that have a section in the configuration, and both if neither has
   * one.
   *
   * It reports per device instead of throwing, and leaves no device running.
   */
  prepare(options?: DeviceButlerPrepareOptions): Promise<DeviceButlerPreparation>

  /**
   * Releases everything the butler holds. Cameras and microphones stop at once and cannot be opened through this
   * butler any more; the other tabs get them a moment later.
   *
   * @returns a promise that resolves once the cameras and microphones are free for others
   */
  dispose(): Promise<void>
}
