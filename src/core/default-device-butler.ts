import './disposable-polyfill.ts'

import { DefaultDeviceFiles } from '../files/default-device-files.ts'
import type { DeviceFiles } from '../files/device-files.ts'
import { DefaultDeviceLocation } from '../location/default-device-location.ts'
import type { DeviceLocation } from '../location/device-location.ts'
import { MediaAccess } from '../media/access/media-access.ts'
import type { MediaMessages } from '../media/access/media-messages.ts'
import { MediaPermissionRequester } from '../media/access/media-permission-requester.ts'
import { DefaultCameraManager } from '../media/camera/default-camera-manager.ts'
import type { CameraManager } from '../media/camera/camera-manager.ts'
import { DefaultMediaManager } from '../media/combined/default-media-manager.ts'
import type { MediaManager } from '../media/combined/media-manager.ts'
import { DefaultMicrophoneManager } from '../media/microphone/default-microphone-manager.ts'
import type { AudioOutputManager } from '../media/output/audio-output-manager.ts'
import { DefaultAudioOutputManager } from '../media/output/default-audio-output-manager.ts'
import { DefaultMediaRecordingManager } from '../media/recording/default-media-recording-manager.ts'
import type { MediaRecordingManager } from '../media/recording/media-recording-manager.ts'
import { DefaultDeviceNetwork } from '../network/default-device-network.ts'
import type { DeviceNetwork } from '../network/device-network.ts'
import { DefaultOutboxManager } from '../outbox/default-outbox-manager.ts'
import type { OutboxManager } from '../outbox/outbox.ts'
import { DefaultScreenFullscreen } from '../screen/fullscreen/default-screen-fullscreen.ts'
import type { ScreenFullscreen } from '../screen/fullscreen/screen-fullscreen.ts'
import { DefaultScreenWakeLock } from '../screen/wake-lock/default-screen-wake-lock.ts'
import type { ScreenWakeLock } from '../screen/wake-lock/screen-wake-lock.ts'
import { DefaultDeviceClipboard } from '../sharing/clipboard/default-device-clipboard.ts'
import type { DeviceClipboard } from '../sharing/clipboard/device-clipboard.ts'
import { DefaultDeviceShare } from '../sharing/share/default-device-share.ts'
import type { DeviceShare } from '../sharing/share/device-share.ts'
import type { MicrophoneManager } from '../media/microphone/microphone-manager.ts'
import { DefaultPermissionManager } from '../permission/default-permission-manager.ts'
import type { PermissionManager } from '../permission/permission-manager.ts'
import { ClipboardReadPermissionRequester } from '../permission/requesters/clipboard-read-permission-requester.ts'
import { GeolocationPermissionRequester } from '../permission/requesters/geolocation-permission-requester.ts'
import { WakeLockPermissionRequester } from '../permission/requesters/wake-lock-permission-requester.ts'
import { PersistentStoragePermissionRequester } from '../permission/requesters/persistent-storage-permission-requester.ts'
import { DefaultDeviceOrientation } from '../platform/default-device-orientation.ts'
import type { DeviceOrientation } from '../platform/device-orientation.ts'
import { DefaultDevicePlatform } from '../platform/default-device-platform.ts'
import type { DevicePlatform } from '../platform/device-platform.ts'
import { DefaultPageLifecycle } from '../platform/page/default-page-lifecycle.ts'
import type { PageLifecycle } from '../platform/page/page-lifecycle.ts'
import { DefaultStorageManager } from '../storage/default-storage-manager.ts'
import type { StorageManager } from '../storage/storage-manager.ts'
import type { StorageMessages } from '../storage/store/store-change.ts'
import { CrossTabChannel } from './coordination/channel/cross-tab-channel.ts'
import { CrossTabLock } from './coordination/lock/cross-tab-lock.ts'
import { DefaultTabCoordination } from './coordination/default-tab-coordination.ts'
import type { TabCoordination } from './coordination/tab-coordination.ts'
import type { DeviceButlerConfiguration } from './device-butler-configuration.ts'
import { BrowserEnvironment } from './environment/browser-environment.ts'
import { NullLogger } from './logging/null-logger.ts'
import { ScopedLogger } from './logging/scoped-logger.ts'
import type { DeviceButler, DeviceButlerPreparation, DeviceButlerPrepareOptions } from './device-butler.ts'

/**
 * Everything the parts of the library send to the other tabs.
 */
type DeviceButlerMessages = StorageMessages & MediaMessages

/**
 * What `prepare()` has found so far.
 */
type Preparation = { -readonly [Kind in keyof DeviceButlerPreparation]: DeviceButlerPreparation[Kind] }

/**
 * The implementation of {@link DeviceButler}.
 */
export class DefaultDeviceButler implements DeviceButler {
  /**
   * The composition root: builds every part of the library and injects what they share. Nothing of the browser is
   * touched here, so it is safe during server-side rendering and shows no permission prompt.
   *
   * Every call returns a new object. An application that wants a single one keeps it itself.
   */
  public static create(
    configuration: DeviceButlerConfiguration = {},
    environment: BrowserEnvironment = BrowserEnvironment.browser()
  ): DeviceButler {
    const logger = configuration.logger ?? new NullLogger()

    const lock = CrossTabLock.create(environment, logger)
    const channel = CrossTabChannel.create<DeviceButlerMessages>(environment, logger)

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

    const wakeLock = new DefaultScreenWakeLock(environment, new ScopedLogger('ScreenWakeLock', logger))
    const page = new DefaultPageLifecycle(environment, new ScopedLogger('PageLifecycle', logger))
    const network = new DefaultDeviceNetwork(environment, new ScopedLogger('DeviceNetwork', logger))

    const permission = new DefaultPermissionManager(
      environment,
      {
        // a request without a facing asks for what the application configured
        camera: new MediaPermissionRequester(cameraGate, () => DefaultCameraManager.scopesFor(camera.configuration)),
        microphone: new MediaPermissionRequester(microphoneGate, ['any']),
        geolocation: new GeolocationPermissionRequester(environment),
        'persistent-storage': new PersistentStoragePermissionRequester(environment),
        'clipboard-read': new ClipboardReadPermissionRequester(environment),
        'screen-wake-lock': new WakeLockPermissionRequester(wakeLock),
      },
      new ScopedLogger('PermissionManager', logger)
    )

    const isConfigured = {
      camera: configuration.camera !== undefined,
      microphone: configuration.microphone !== undefined,
    }

    return new DefaultDeviceButler(
      {
        // an application that only configured a camera is not asked for its microphone
        ...(isConfigured.camera || isConfigured.microphone ? isConfigured : { camera: true, microphone: true }),
        storage: configuration.storage !== undefined,
        location: configuration.location !== undefined,
      },
      storage,
      camera,
      microphone,
      new DefaultMediaManager(camera, microphone, environment, new ScopedLogger('MediaManager', logger)),
      permission,
      new DefaultTabCoordination(lock),
      new DefaultDeviceLocation(environment, new ScopedLogger('DeviceLocation', logger), configuration.location),
      new DefaultDevicePlatform(environment),
      new DefaultDeviceOrientation(environment, new ScopedLogger('DeviceOrientation', logger)),
      page,
      // the recordings share the wake lock and the page of the butler
      new DefaultMediaRecordingManager(environment, wakeLock, page, new ScopedLogger('MediaRecordingManager', logger)),
      new DefaultAudioOutputManager(environment, new ScopedLogger('AudioOutputManager', logger)),
      network,
      wakeLock,
      new DefaultScreenFullscreen(environment, new ScopedLogger('ScreenFullscreen', logger)),
      new DefaultDeviceShare(environment),
      new DefaultDeviceClipboard(environment),
      new DefaultDeviceFiles(environment, new ScopedLogger('DeviceFiles', logger)),
      // the outboxes keep their items in the storage of the butler and send under its lock
      new DefaultOutboxManager(storage, lock, network, logger),
      channel,
      [cameraGate, microphoneGate]
    )
  }

  private disposing: Promise<void> | undefined

  private constructor(
    private readonly prepared: DeviceButlerPrepareOptions,
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
    public readonly page: PageLifecycle,
    public readonly recorder: MediaRecordingManager,
    public readonly audioOutput: AudioOutputManager,
    public readonly network: DeviceNetwork,
    public readonly wakeLock: ScreenWakeLock,
    public readonly fullscreen: ScreenFullscreen,
    public readonly share: DeviceShare,
    public readonly clipboard: DeviceClipboard,
    public readonly files: DeviceFiles,
    public readonly outbox: OutboxManager,
    private readonly channel: CrossTabChannel<DeviceButlerMessages>,
    private readonly gates: readonly MediaAccess[]
  ) {}

  public async prepare(options: DeviceButlerPrepareOptions = this.prepared): Promise<DeviceButlerPreparation> {
    const { storage = false, camera = false, microphone = false, location = false } = options

    // what was not asked for has no entry
    const found: Preparation = {}

    // one after the other, so the browser shows one prompt at a time
    if (storage !== false) {
      found.storage = await this.storage.prepare(storage === true ? undefined : storage)
    }

    if (camera !== false) {
      found.camera = await this.camera.prepare(camera === true ? undefined : camera)
    }

    if (microphone !== false) {
      found.microphone = await this.microphone.prepare(microphone === true ? undefined : microphone)
    }

    if (location) {
      found.location = { permission: await this.permission.request('geolocation') }
    }

    return found
  }

  public dispose(): Promise<void> {
    this.disposing ??= this.release()

    return this.disposing
  }

  /**
   * Calls {@link dispose} without waiting for it, so the butler can be declared with `using`.
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

    // before the storage and the network it works with
    this.outbox.dispose()
    this.location.dispose()
    this.orientation.dispose()
    this.page.dispose()
    this.audioOutput.dispose()
    this.network.dispose()
    this.wakeLock.dispose()
    this.fullscreen.dispose()
    this.storage.dispose()
    this.permission.dispose()

    // the channel tells the other tabs that the devices are free, so it is closed last
    await released
    this.channel.close()
  }
}
