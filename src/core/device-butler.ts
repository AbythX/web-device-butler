import type { DeviceFiles } from '../files/device-files.ts'
import type { DeviceLocation } from '../location/device-location.ts'
import type { LocationPreparation } from '../location/location-preparation.ts'
import type { CameraPreparation } from '../media/camera/camera-preparation.ts'
import type { AudioOutputManager } from '../media/output/audio-output-manager.ts'
import type { MediaRecordingManager } from '../media/recording/media-recording-manager.ts'
import type { DeviceNetwork } from '../network/device-network.ts'
import type { OutboxManager } from '../outbox/outbox.ts'
import type { ScreenFullscreen } from '../screen/fullscreen/screen-fullscreen.ts'
import type { ScreenWakeLock } from '../screen/wake-lock/screen-wake-lock.ts'
import type { DeviceClipboard } from '../sharing/clipboard/device-clipboard.ts'
import type { DeviceShare } from '../sharing/share/device-share.ts'
import type { CameraManager } from '../media/camera/camera-manager.ts'
import type { CameraRequirements } from '../media/camera/model/camera-requirements.ts'
import type { MediaManager } from '../media/combined/media-manager.ts'
import type { MicrophonePreparation } from '../media/microphone/microphone-preparation.ts'
import type { MicrophoneManager } from '../media/microphone/microphone-manager.ts'
import type { MicrophoneRequirements } from '../media/microphone/model/microphone-requirements.ts'
import type { PermissionManager } from '../permission/permission-manager.ts'
import type { DeviceOrientation } from '../platform/device-orientation.ts'
import type { DevicePlatform } from '../platform/device-platform.ts'
import type { PageLifecycle } from '../platform/page/page-lifecycle.ts'
import type { StorageRequirements } from '../storage/selection/storage-requirements.ts'
import type { StorageManager } from '../storage/storage-manager.ts'
import type { StoragePreparation } from '../storage/storage-preparation.ts'
import type { TabCoordination } from './coordination/tab-coordination.ts'

/**
 * What `butler.prepare()` prepares. Without options it prepares what has a section in the configuration, and the
 * camera and the microphone if neither of the two has one.
 */
export interface DeviceButlerPrepareOptions {
  /** `true` for the configured storage, or requirements that override the configuration for this call */
  storage?: boolean | StorageRequirements
  /** `true` for the configured camera, or requirements that override the configuration for this call */
  camera?: boolean | Partial<CameraRequirements>
  /** `true` for the configured microphone, or requirements that override the configuration for this call */
  microphone?: boolean | Partial<MicrophoneRequirements>
  /** `true` requests the permission to ask where the device is */
  location?: boolean
}

/**
 * What `butler.prepare()` found out, per section that was asked for.
 */
export interface DeviceButlerPreparation {
  readonly storage?: StoragePreparation
  readonly camera?: CameraPreparation
  readonly microphone?: MicrophonePreparation
  readonly location?: LocationPreparation
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

  /** how the device is held, and keeping the page that way */
  readonly orientation: DeviceOrientation

  /** whether the user can see the page, and when it is about to go */
  readonly page: PageLifecycle

  /** records what a camera or a microphone delivers */
  readonly recorder: MediaRecordingManager

  /** the speakers and headsets, and sending sound to one of them */
  readonly audioOutput: AudioOutputManager

  /** whether the device has a network */
  readonly network: DeviceNetwork

  /** keeps the screen on */
  readonly wakeLock: ScreenWakeLock

  /** fills the screen with one element of the page */
  readonly fullscreen: ScreenFullscreen

  /** hands something over to another application through the share sheet of the system */
  readonly share: DeviceShare

  /** the clipboard of the system */
  readonly clipboard: DeviceClipboard

  /** saves files to the device and takes files the user chooses */
  readonly files: DeviceFiles

  /** keeps what should be sent until the device has a network, and sends it then */
  readonly outbox: OutboxManager

  /**
   * The one explicit, awaited step that does the slow and user-visible work up front: it requests the permissions
   * the configuration needs, looks at the cameras and says which one `open()` would start. An application runs it
   * on a set-up or permission screen. It is optional; `open()` does the same on demand.
   *
   * Without options it prepares what has a section in the configuration, and the camera and the microphone if
   * neither of the two has one. For the storage it says which backend the stores would be kept in and asks for the
   * protection against eviction the configuration names; for the location it requests the permission.
   *
   * It reports per section instead of throwing, and leaves no device running.
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
