import type { ServiceIdentifier } from 'inversify'

import type { TabCoordination } from '../../core/coordination/tab-coordination.ts'
import type { DeviceButler } from '../../core/device-butler.ts'
import type { DeviceFiles } from '../../files/device-files.ts'
import type { DeviceLocation } from '../../location/device-location.ts'
import type { CameraManager } from '../../media/camera/camera-manager.ts'
import type { MediaManager } from '../../media/combined/media-manager.ts'
import type { MicrophoneManager } from '../../media/microphone/microphone-manager.ts'
import type { CodeScanner } from '../../media/scanning/code-scanner.ts'
import type { ScreenCaptureManager } from '../../media/screen-capture/screen-capture-manager.ts'
import type { AudioOutputManager } from '../../media/output/audio-output-manager.ts'
import type { MediaRecordingManager } from '../../media/recording/media-recording-manager.ts'
import type { DeviceNetwork } from '../../network/device-network.ts'
import type { OutboxManager } from '../../outbox/outbox.ts'
import type { PermissionManager } from '../../permission/permission-manager.ts'
import type { DeviceOrientation } from '../../platform/device-orientation.ts'
import type { DevicePlatform } from '../../platform/device-platform.ts'
import type { PageLifecycle } from '../../platform/page/page-lifecycle.ts'
import type { ScreenFullscreen } from '../../screen/fullscreen/screen-fullscreen.ts'
import type { ScreenWakeLock } from '../../screen/wake-lock/screen-wake-lock.ts'
import type { DeviceClipboard } from '../../sharing/clipboard/device-clipboard.ts'
import type { DeviceShare } from '../../sharing/share/device-share.ts'
import type { StorageManager } from '../../storage/storage-manager.ts'

/**
 * The identifiers under which `DeviceButlerContainerModule` binds the butler and its parts. Each carries the type of
 * what it stands for, so `container.get(DeviceButlerBindings.Camera)` is a `CameraManager`.
 */
export class DeviceButlerBindings {
  /**
   * Identifies the butler itself.
   */
  public static readonly DeviceButler = DeviceButlerBindings.identifier<DeviceButler>('DeviceButler')
  /**
   * Identifies the storage manager, `butler.storage`.
   */
  public static readonly Storage = DeviceButlerBindings.identifier<StorageManager>('Storage')
  /**
   * Identifies the camera manager, `butler.camera`.
   */
  public static readonly Camera = DeviceButlerBindings.identifier<CameraManager>('Camera')
  /**
   * Identifies the microphone manager, `butler.microphone`.
   */
  public static readonly Microphone = DeviceButlerBindings.identifier<MicrophoneManager>('Microphone')
  /**
   * Identifies the manager of camera and microphone together and of joined sessions, `butler.media`.
   */
  public static readonly Media = DeviceButlerBindings.identifier<MediaManager>('Media')
  /**
   * Identifies the capture of the screen, `butler.screenCapture`.
   */
  public static readonly ScreenCapture = DeviceButlerBindings.identifier<ScreenCaptureManager>('ScreenCapture')
  /**
   * Identifies the permission manager, `butler.permission`.
   */
  public static readonly Permission = DeviceButlerBindings.identifier<PermissionManager>('Permission')
  /**
   * Identifies the coordination across tabs, `butler.coordination`.
   */
  public static readonly Coordination = DeviceButlerBindings.identifier<TabCoordination>('Coordination')
  /**
   * Identifies the location, `butler.location`.
   */
  public static readonly Location = DeviceButlerBindings.identifier<DeviceLocation>('Location')
  /**
   * Identifies the platform, `butler.platform`.
   */
  public static readonly Platform = DeviceButlerBindings.identifier<DevicePlatform>('Platform')
  /**
   * Identifies the orientation, `butler.orientation`.
   */
  public static readonly Orientation = DeviceButlerBindings.identifier<DeviceOrientation>('Orientation')
  /**
   * Identifies the lifecycle of the page, `butler.page`.
   */
  public static readonly Page = DeviceButlerBindings.identifier<PageLifecycle>('Page')
  /**
   * Identifies the recorder, `butler.recorder`.
   */
  public static readonly Recorder = DeviceButlerBindings.identifier<MediaRecordingManager>('Recorder')
  /**
   * Identifies the reader of codes, `butler.scanner`.
   */
  public static readonly Scanner = DeviceButlerBindings.identifier<CodeScanner>('Scanner')
  /**
   * Identifies the audio outputs, `butler.audioOutput`.
   */
  public static readonly AudioOutput = DeviceButlerBindings.identifier<AudioOutputManager>('AudioOutput')
  /**
   * Identifies the network, `butler.network`.
   */
  public static readonly Network = DeviceButlerBindings.identifier<DeviceNetwork>('Network')
  /**
   * Identifies the wake lock of the screen, `butler.wakeLock`.
   */
  public static readonly WakeLock = DeviceButlerBindings.identifier<ScreenWakeLock>('WakeLock')
  /**
   * Identifies what fills the screen with an element, `butler.fullscreen`.
   */
  public static readonly Fullscreen = DeviceButlerBindings.identifier<ScreenFullscreen>('Fullscreen')
  /**
   * Identifies the share sheet, `butler.share`.
   */
  public static readonly Share = DeviceButlerBindings.identifier<DeviceShare>('Share')
  /**
   * Identifies the clipboard, `butler.clipboard`.
   */
  public static readonly Clipboard = DeviceButlerBindings.identifier<DeviceClipboard>('Clipboard')
  /**
   * Identifies the files of the device, `butler.files`.
   */
  public static readonly Files = DeviceButlerBindings.identifier<DeviceFiles>('Files')
  /**
   * Identifies the outboxes, `butler.outbox`.
   */
  public static readonly Outbox = DeviceButlerBindings.identifier<OutboxManager>('Outbox')

  private static identifier<T>(name: string): ServiceIdentifier<T> {
    // registered globally, so two copies of the library in one application still agree on the identifiers
    return Symbol.for(`web-device-butler:${name}`)
  }
}
