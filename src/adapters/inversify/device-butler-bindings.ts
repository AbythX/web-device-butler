import type { ServiceIdentifier } from 'inversify'

import type { TabCoordination } from '../../core/coordination/tab-coordination.ts'
import type { DeviceButler } from '../../core/device-butler.ts'
import type { DeviceLocation } from '../../location/device-location.ts'
import type { CameraManager } from '../../media/camera/camera-manager.ts'
import type { MediaManager } from '../../media/combined/media-manager.ts'
import type { MicrophoneManager } from '../../media/microphone/microphone-manager.ts'
import type { PermissionManager } from '../../permission/permission-manager.ts'
import type { DeviceOrientation } from '../../platform/device-orientation.ts'
import type { DevicePlatform } from '../../platform/device-platform.ts'
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
   * Identifies the manager of camera and microphone together, `butler.media`.
   */
  public static readonly Media = DeviceButlerBindings.identifier<MediaManager>('Media')
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

  private static identifier<T>(name: string): ServiceIdentifier<T> {
    // registered globally, so two copies of the library in one application still agree on the identifiers
    return Symbol.for(`web-device-butler:${name}`)
  }
}
