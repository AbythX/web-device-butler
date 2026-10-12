import { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import { CrossTabLock } from '../../core/coordination/lock/cross-tab-lock.ts'
import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { PageVisibility } from '../../core/environment/page-visibility.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { ScopedLogger } from '../../core/logging/scoped-logger.ts'
import { DefaultDevicePlatform } from '../../platform/default-device-platform.ts'
import { DefaultStorageManager } from '../../storage/default-storage-manager.ts'
import type { StorageManager } from '../../storage/storage-manager.ts'
import type { StorageMessages } from '../../storage/store/store-change.ts'
import { MediaAccess } from '../access/media-access.ts'
import type { MediaAccessScope } from '../access/media-access-state.ts'
import type { MediaLease } from '../access/media-lease.ts'
import type { MediaMessages } from '../access/media-messages.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import type { MediaInputStart } from '../input/media-input-manager.ts'
import { BaseMediaInputManager } from '../input/base-media-input-manager.ts'
import type { PlatformQuirk } from '../quirks/platform-quirk.ts'
import { PlatformQuirks } from '../quirks/platform-quirks.ts'
import type { CameraPreparation } from './camera-preparation.ts'
import { CameraCapabilityReader } from './discovery/camera-capability-reader.ts'
import { CameraProbeCache } from './discovery/camera-probe-cache.ts'
import { CameraProber } from './discovery/camera-prober.ts'
import { CameraSelector } from './discovery/camera-selector.ts'
import type { CameraTiming } from './discovery/camera-timing.ts'
import { CameraDescriptor } from './model/camera-descriptor.ts'
import { CameraFeatures } from './model/camera-features.ts'
import type { CameraConfiguration, CameraRequirements } from './model/camera-requirements.ts'
import { CameraConstraints } from './session/camera-constraints.ts'
import type { CameraSession, CameraSessionHost } from './session/camera-session.ts'
import { DefaultCameraSession } from './session/default-camera-session.ts'
import type { CameraListOptions, CameraManager, CameraManagerParts } from './camera-manager.ts'

/**
 * The implementation of {@link CameraManager}.
 */
export class DefaultCameraManager
  extends BaseMediaInputManager<CameraDescriptor, CameraSession, CameraRequirements>
  implements CameraManager
{
  /**
   * For applications that only use the camera module. Otherwise the manager is reached through `DeviceButler`.
   */
  public static create(
    configuration: CameraConfiguration = {},
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): CameraManager {
    const lock = CrossTabLock.create(environment, logger)
    const channel = CrossTabChannel.create<StorageMessages & MediaMessages>(environment, logger)
    const storage = new DefaultStorageManager({}, environment, lock, channel, logger)
    const gate = MediaAccess.create('camera', environment, lock, channel, logger)

    return DefaultCameraManager.assemble(configuration, gate, storage, environment, logger, {}, [
      gate,
      storage,
      { [Symbol.dispose]: () => channel.close() },
    ])
  }

  /**
   * Builds a manager on parts that are shared with the rest of the library.
   *
   * @param storage where the features of the cameras are remembered
   * @param owned what is disposed together with the manager
   */
  public static assemble(
    configuration: CameraConfiguration,
    gate: MediaAccess,
    storage: StorageManager,
    environment: BrowserEnvironment,
    logger: Logger,
    timing: CameraTiming = {},
    owned: readonly Disposable[] = []
  ): CameraManager {
    const platform = new DefaultDevicePlatform(environment)
    let readerQuirks: PlatformQuirk[] | undefined
    const reader = new CameraCapabilityReader(() => (readerQuirks ??= PlatformQuirks.for(platform, 'camera')), timing)

    return new DefaultCameraManager(
      configuration,
      {
        gate,
        reader,
        prober: new CameraProber(reader, new ScopedLogger('CameraProber', logger)),
        cache: CameraProbeCache.in(storage, new ScopedLogger('CameraProbeCache', logger)),
        selector: new CameraSelector(),
        visibility: new PageVisibility(environment),
        quirks: () => PlatformQuirks.for(platform, 'camera'),
        timing,
      },
      new ScopedLogger('CameraManager', logger),
      owned
    )
  }

  private readonly host: CameraSessionHost

  public constructor(
    configuration: CameraConfiguration,
    private readonly parts: CameraManagerParts,
    logger: Logger,
    owned: readonly Disposable[] = []
  ) {
    super(configuration, parts.gate, logger, owned)

    this.host = {
      restart: (requirements, lease) => this.start(requirements, lease),
      merge: (requirements, changes) => this.merge(requirements, changes),
      whenVisible: () => parts.visibility.whenVisible(),
    }
  }

  public override list(options: CameraListOptions = {}): Promise<CameraDescriptor[]> {
    if (options.detail === 'probed') {
      // every camera, whatever the configuration prefers
      return this.survey({ whenBusy: this.configuration.whenBusy })
    }

    return this.known()
  }

  public async prepare(requirements?: Partial<CameraRequirements>): Promise<CameraPreparation> {
    const {
      permission,
      devices: cameras,
      selected,
      error,
      requirements: merged,
    } = await this.prepareInput(requirements)

    if (selected === undefined) {
      return { permission, cameras, error }
    }

    return {
      permission,
      cameras,
      selected,
      isResolutionAvailable:
        merged.resolution === undefined ? undefined : selected.features.maxResolution?.covers(merged.resolution),
    }
  }

  public forget(): Promise<void> {
    return this.parts.cache.clear()
  }

  protected describe(device: MediaDeviceInfo): CameraDescriptor {
    return CameraDescriptor.listed(device)
  }

  /**
   * Without a facing both sides are requested, the back first: it is the one applications need most.
   */
  protected accessScopes(requirements: CameraRequirements): readonly MediaAccessScope[] {
    return requirements.facing === undefined ? ['back', 'front'] : [requirements.facing]
  }

  protected scopeOf(descriptor: CameraDescriptor): MediaAccessScope {
    return descriptor.facing === 'front' || descriptor.facing === 'back' ? descriptor.facing : 'any'
  }

  protected pick(
    descriptors: readonly CameraDescriptor[],
    requirements: CameraRequirements
  ): CameraDescriptor | undefined {
    return this.parts.selector.select(descriptors, requirements).best
  }

  protected override explainMismatch(
    descriptors: readonly CameraDescriptor[],
    requirements: CameraRequirements
  ): string {
    return this.parts.selector.select(descriptors, requirements).explain()
  }

  protected override constraintsFor(requirements: CameraRequirements): MediaTrackConstraints {
    // SAFETY: TrackConstraints only adds the hardware settings the DOM types do not know yet; the browser takes them
    return CameraConstraints.for(requirements) as MediaTrackConstraints
  }

  /**
   * Remembered cameras can be out of date in ways the list does not show. If the browser does not know the chosen
   * camera, the cameras are looked at again and the choice is made once more.
   */
  protected override async start(
    requirements: CameraRequirements,
    lease: MediaLease
  ): Promise<MediaInputStart<CameraDescriptor>> {
    const descriptor = await this.resolve(requirements, lease)

    try {
      return await this.run(descriptor, requirements, lease)
    } catch (error) {
      if (descriptor.detail !== 'probed' || !DefaultCameraManager.isUnknownDevice(error)) {
        throw error
      }

      this.logger.info(`The browser does not know the camera '${descriptor.label}', looking at the cameras again`)
      await this.parts.cache.clear()

      return this.run(await this.resolve(requirements, lease), requirements, lease)
    }
  }

  protected createSession(
    lease: MediaLease,
    stream: MediaStream,
    requirements: CameraRequirements,
    descriptor: CameraDescriptor
  ): CameraSession {
    return new DefaultCameraSession(
      lease,
      stream,
      descriptor,
      requirements,
      this.parts.quirks(),
      this.host,
      new ScopedLogger('CameraSession', this.logger),
      this.parts.timing
    )
  }

  private static isUnknownDevice(error: unknown): boolean {
    return (
      error instanceof MediaDeviceNotFoundError ||
      (error instanceof MediaRequirementsError && error.constraint === 'deviceId')
    )
  }

  /**
   * Starts the camera and waits until it reports what it can do. A camera that was not looked at before is looked
   * at now, which costs nothing: it is running anyway.
   */
  private async run(
    descriptor: CameraDescriptor,
    requirements: CameraRequirements,
    lease: MediaLease
  ): Promise<MediaInputStart<CameraDescriptor>> {
    const stream = await lease.open(this.requestFor(descriptor, requirements))
    const [track] = stream.getVideoTracks()

    if (track === undefined) {
      return { descriptor, stream }
    }

    if (descriptor.detail === 'probed') {
      const capabilities = await this.parts.reader.settle(track, descriptor.features)

      if (CameraFeatures.fromCapabilities(capabilities).includes(descriptor.features)) {
        return { descriptor, stream }
      }

      // what is remembered is out of date; corrected, the next start does not wait for a feature that is gone
      this.logger.info(`The camera '${descriptor.label}' no longer has everything that was remembered about it`)
      const corrected = descriptor.probedWith(capabilities)
      await this.parts.cache.remember(await this.enumerate(), [corrected])

      return { descriptor: corrected, stream }
    }

    const probed = descriptor.probedWith(await this.parts.reader.settle(track))
    await this.parts.cache.remember(await this.enumerate(), [probed])

    return { descriptor: probed, stream }
  }

  /**
   * What the browser lists, described without starting anything.
   */
  private enumerate(): Promise<CameraDescriptor[]> {
    return super.list()
  }

  /**
   * What is known about the cameras without starting one.
   */
  private async known(): Promise<CameraDescriptor[]> {
    return this.parts.cache.apply(await this.enumerate())
  }

  /**
   * A tab that cannot list the cameras, because another tab holds them, answers with what was remembered about
   * them on an earlier visit.
   */
  protected override async remembered(): Promise<CameraDescriptor[]> {
    const known = await this.known()

    return known.length > 0 ? known : this.parts.cache.all()
  }

  /**
   * Lists the cameras and starts those that the requirements can match and nothing is known about yet.
   */
  protected override async candidates(
    requirements: CameraRequirements,
    lease: MediaLease
  ): Promise<CameraDescriptor[]> {
    const listed = await this.enumerate()
    const known = await this.parts.cache.apply(listed)

    // a camera that is asked for by its id is started anyway, and looked at then
    if (requirements.id !== undefined) {
      return known
    }

    const isFirstEnough = requirements.strategy === 'first'

    if (isFirstEnough && this.pick(known, requirements) !== undefined) {
      return known
    }

    const unseen = this.parts.selector.narrow(known, requirements).filter(
      (descriptor) =>
        descriptor.detail !== 'probed' &&
        descriptor.id.length > 0 &&
        // a camera on a side that access was refused for is left as it is listed
        this.gate.state.isGranted(this.scopeOf(descriptor))
    )

    if (unseen.length === 0) {
      return known
    }

    const probed = await this.parts.prober.probe(lease, unseen, {
      scopeOf: (descriptor) => this.scopeOf(descriptor),
      until: isFirstEnough ? (descriptor) => descriptor.satisfies(requirements) : undefined,
    })

    await this.parts.cache.remember(listed, probed)

    return known.map((descriptor) => probed.find((candidate) => candidate.id === descriptor.id) ?? descriptor)
  }
}
