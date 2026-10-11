import type { interfaces } from 'inversify'

import type { TabCoordination } from '../../core/coordination/tab-coordination.ts'
import type { Device } from '../../core/device.ts'
import type { DeviceLocation } from '../../location/device-location.ts'
import type { CameraManager } from '../../media/camera/camera-manager.ts'
import type { MediaManager } from '../../media/combined/media-manager.ts'
import type { MicrophoneManager } from '../../media/microphone/microphone-manager.ts'
import type { PermissionManager } from '../../permission/permission-manager.ts'
import type { DeviceOrientation } from '../../platform/device-orientation.ts'
import type { DevicePlatform } from '../../platform/device-platform.ts'
import type { StorageManager } from '../../storage/storage-manager.ts'

/**
 * The identifiers under which `DeviceContainerModule` binds the device and its parts. Each carries the type of
 * what it stands for, so `container.get(DeviceBindings.Camera)` is a `CameraManager`.
 */
export class DeviceBindings {
  /**
   * Identifies the device itself.
   */
  public static readonly Device = DeviceBindings.identifier<Device>('Device')
  /**
   * Identifies the storage manager, `device.storage`.
   */
  public static readonly Storage = DeviceBindings.identifier<StorageManager>('Storage')
  /**
   * Identifies the camera manager, `device.camera`.
   */
  public static readonly Camera = DeviceBindings.identifier<CameraManager>('Camera')
  /**
   * Identifies the microphone manager, `device.microphone`.
   */
  public static readonly Microphone = DeviceBindings.identifier<MicrophoneManager>('Microphone')
  /**
   * Identifies the manager of camera and microphone together, `device.media`.
   */
  public static readonly Media = DeviceBindings.identifier<MediaManager>('Media')
  /**
   * Identifies the permission manager, `device.permission`.
   */
  public static readonly Permission = DeviceBindings.identifier<PermissionManager>('Permission')
  /**
   * Identifies the coordination across tabs, `device.coordination`.
   */
  public static readonly Coordination = DeviceBindings.identifier<TabCoordination>('Coordination')
  /**
   * Identifies the location, `device.location`.
   */
  public static readonly Location = DeviceBindings.identifier<DeviceLocation>('Location')
  /**
   * Identifies the platform, `device.platform`.
   */
  public static readonly Platform = DeviceBindings.identifier<DevicePlatform>('Platform')
  /**
   * Identifies the orientation, `device.orientation`.
   */
  public static readonly Orientation = DeviceBindings.identifier<DeviceOrientation>('Orientation')

  private static identifier<T>(name: string): interfaces.ServiceIdentifier<T> {
    // registered globally, so two copies of the library in one application still agree on the identifiers
    return Symbol.for(`web-device-butler:${name}`)
  }
}
