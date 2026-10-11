import './disposable-polyfill.ts'

import { DefaultDeviceLocation } from '../location/default-device-location.ts'
import type { DeviceLocation } from '../location/device-location.ts'
import { MediaAccess } from '../media/access/media-access.ts'
import type { MediaAccessScope } from '../media/access/media-access-state.ts'
import type { MediaMessages } from '../media/access/media-messages.ts'
import { MediaPermissionRequester } from '../media/access/media-permission-requester.ts'
import { DefaultCameraManager } from '../media/camera/default-camera-manager.ts'
import type { CameraManager } from '../media/camera/camera-manager.ts'
import { DefaultMediaManager } from '../media/combined/default-media-manager.ts'
import type { MediaManager } from '../media/combined/media-manager.ts'
import { DefaultMicrophoneManager } from '../media/microphone/default-microphone-manager.ts'
import type { MicrophoneManager } from '../media/microphone/microphone-manager.ts'
import { DefaultPermissionManager } from '../permission/default-permission-manager.ts'
import type { PermissionManager } from '../permission/permission-manager.ts'
import { GeolocationPermissionRequester } from '../permission/requesters/geolocation-permission-requester.ts'
import { PersistentStoragePermissionRequester } from '../permission/requesters/persistent-storage-permission-requester.ts'
import { DefaultDeviceOrientation } from '../platform/default-device-orientation.ts'
import type { DeviceOrientation } from '../platform/device-orientation.ts'
import { DefaultDevicePlatform } from '../platform/default-device-platform.ts'
import type { DevicePlatform } from '../platform/device-platform.ts'
import { DefaultStorageManager } from '../storage/default-storage-manager.ts'
import type { StorageManager } from '../storage/storage-manager.ts'
import type { StorageMessages } from '../storage/store/store-change.ts'
import { CrossTabChannel } from './coordination/channel/cross-tab-channel.ts'
import { CrossTabLock } from './coordination/lock/cross-tab-lock.ts'
import { DefaultTabCoordination } from './coordination/default-tab-coordination.ts'
import type { TabCoordination } from './coordination/tab-coordination.ts'
import type { DeviceConfiguration } from './device-configuration.ts'
import { DeviceEnvironment } from './environment/device-environment.ts'
import { NullLogger } from './logging/null-logger.ts'
import { ScopedLogger } from './logging/scoped-logger.ts'
import type { Device, DeviceInitialization, DeviceInitializeOptions } from './device.ts'

/**
 * Everything the parts of the library send to the other tabs.
 */
type DeviceMessages = StorageMessages & MediaMessages

/**
 * What `initialize()` has found so far.
 */
type Preparation = { -readonly [Kind in keyof DeviceInitialization]: DeviceInitialization[Kind] }

/**
 * The implementation of {@link Device}.
 */
export class DefaultDevice implements Device {
  /**
   * The composition root: builds every part of the library and injects what they share. Nothing of the browser is
   * touched here, so it is safe during server-side rendering and shows no permission prompt.
   *
   * Every call returns a new object. An application that wants a single one keeps it itself.
   */
  public static create(
    configuration: DeviceConfiguration = {},
    environment: DeviceEnvironment = DeviceEnvironment.browser()
  ): Device {
    const logger = configuration.logger ?? new NullLogger()

    const lock = CrossTabLock.create(environment, logger)
    const channel = CrossTabChannel.create<DeviceMessages>(environment, logger)

    const storage = new DefaultStorageManager(configuration.storage ?? {}, environment, lock, channel, logger)

    const cameraGate = MediaAccess.create('camera', environment, lock, channel, logger)
    const microphoneGate = MediaAccess.create('microphone', environment, lock, channel, logger)

    const camera = DefaultCameraManager.assemble(configuration.camera ?? {}, cameraGate, storage, environment, logger)

    const microphone = DefaultMicrophoneManager.assemble(
      configuration.microphone ?? {},
      microphoneGate,
      environment,
      logger
    )

    // a request without a facing asks for what the application configured
    const cameraScopes = (): MediaAccessScope[] => {
      const { facing } = camera.configuration

      return facing === undefined ? ['back', 'front'] : [facing]
    }

    const permission = new DefaultPermissionManager(
      environment,
      {
        camera: new MediaPermissionRequester(cameraGate, cameraScopes),
        microphone: new MediaPermissionRequester(microphoneGate, ['any']),
        geolocation: new GeolocationPermissionRequester(environment),
        'persistent-storage': new PersistentStoragePermissionRequester(environment),
      },
      new ScopedLogger('PermissionManager', logger)
    )

    const isConfigured = {
      camera: configuration.camera !== undefined,
      microphone: configuration.microphone !== undefined,
    }

    return new DefaultDevice(
      // an application that only configured a camera is not asked for its microphone
      isConfigured.camera || isConfigured.microphone ? isConfigured : { camera: true, microphone: true },
      storage,
      camera,
      microphone,
      new DefaultMediaManager(camera, microphone, environment, new ScopedLogger('MediaManager', logger)),
      permission,
      new DefaultTabCoordination(lock),
      new DefaultDeviceLocation(environment, new ScopedLogger('DeviceLocation', logger)),
      new DefaultDevicePlatform(environment),
      new DefaultDeviceOrientation(environment, new ScopedLogger('DeviceOrientation', logger)),
      channel,
      [cameraGate, microphoneGate]
    )
  }

  private disposing: Promise<void> | undefined

  private constructor(
    private readonly prepared: DeviceInitializeOptions,
    public readonly storage: StorageManager,
    public readonly camera: CameraManager,
    public readonly microphone: MicrophoneManager,
    /** opens a camera and a microphone together */
    public readonly media: MediaManager,
    public readonly permission: PermissionManager,
    public readonly coordination: TabCoordination,
    public readonly location: DeviceLocation,
    public readonly platform: DevicePlatform,
    public readonly orientation: DeviceOrientation,
    private readonly channel: CrossTabChannel<DeviceMessages>,
    private readonly gates: readonly MediaAccess[]
  ) {}

  public async initialize(options: DeviceInitializeOptions = this.prepared): Promise<DeviceInitialization> {
    const { camera = false, microphone = false } = options

    // a device that was not asked for has no entry
    const found: Preparation = {}

    // one after the other, so the browser shows one prompt at a time
    if (camera !== false) {
      found.camera = await this.camera.initialize(camera === true ? undefined : camera)
    }

    if (microphone !== false) {
      found.microphone = await this.microphone.initialize(microphone === true ? undefined : microphone)
    }

    return found
  }

  public dispose(): Promise<void> {
    this.disposing ??= this.release()

    return this.disposing
  }

  /**
   * Calls {@link dispose} without waiting for it, so the device can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    void this.dispose()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `await using`.
   */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.dispose()
  }

  private async release(): Promise<void> {
    const released = Promise.allSettled([
      this.camera.dispose(),
      this.microphone.dispose(),
      ...this.gates.map((gate) => gate.dispose()),
    ])

    this.location.dispose()
    this.orientation.dispose()
    this.storage.dispose()
    this.permission.dispose()

    // the channel tells the other tabs that the devices are free, so it is closed last
    await released
    this.channel.close()
  }
}
