import { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import { CrossTabLock } from '../../core/coordination/lock/cross-tab-lock.ts'
import type { LockMode } from '../../core/coordination/lock/lock-manager-like.ts'
import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { PageVisibility } from '../../core/environment/page-visibility.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { ScopedLogger } from '../../core/logging/scoped-logger.ts'
import { DefaultDevicePlatform } from '../../platform/default-device-platform.ts'
import { MediaAccess } from '../access/media-access.ts'
import type { MediaAccessScope } from '../access/media-access-state.ts'
import type { MediaLease } from '../access/media-lease.ts'
import type { MediaMessages } from '../access/media-messages.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { MediaInputStart } from '../input/media-input-manager.ts'
import { BaseMediaInputManager } from '../input/base-media-input-manager.ts'
import { PlatformQuirks } from '../quirks/platform-quirks.ts'
import type { TrackSettings } from '../session/track-constraints.ts'
import type { MicrophonePreparation } from './microphone-preparation.ts'
import { MicrophoneDescriptor } from './model/microphone-descriptor.ts'
import type { MicrophoneFeatures } from './model/microphone-features.ts'
import type { MicrophoneConfiguration, MicrophoneRequirements } from './model/microphone-requirements.ts'
import { MicrophoneSelector } from './model/microphone-selector.ts'
import { MicrophoneConstraints } from './session/microphone-constraints.ts'
import type { MicrophoneSession, MicrophoneSessionHost, MicrophoneTiming } from './session/microphone-session.ts'
import { DefaultMicrophoneSession } from './session/default-microphone-session.ts'
import type { MicrophoneManager, MicrophoneManagerParts } from './microphone-manager.ts'

/**
 * The microphones without the entries that only stand for another one.
 */
interface ListedMicrophones {
  listed: MediaDeviceInfo[]
  /** the one the system uses by default */
  defaultDevice: MediaDeviceInfo | undefined
}

/**
 * The implementation of {@link MicrophoneManager}.
 */
export class DefaultMicrophoneManager
  extends BaseMediaInputManager<MicrophoneDescriptor, MicrophoneSession, MicrophoneRequirements>
  implements MicrophoneManager
{
  /** entries some browsers add to the list for "whatever the system uses", next to the microphones themselves */
  private static readonly defaultId = 'default'
  private static readonly aliasIds: readonly string[] = ['default', 'communications']

  /**
   * For applications that only use the microphone module. Otherwise the manager is reached through `DeviceButler`.
   */
  public static create(
    configuration: MicrophoneConfiguration = {},
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): MicrophoneManager {
    const lock = CrossTabLock.create(environment, logger)
    const channel = CrossTabChannel.create<MediaMessages>(environment, logger)
    const gate = MediaAccess.create('microphone', environment, lock, channel, logger)

    return DefaultMicrophoneManager.assemble(configuration, gate, environment, logger, {}, [
      gate,
      { [Symbol.dispose]: () => channel.close() },
    ])
  }

  /**
   * Builds a manager on parts that are shared with the rest of the library.
   *
   * @param owned what is disposed together with the manager
   */
  public static assemble(
    configuration: MicrophoneConfiguration,
    gate: MediaAccess,
    environment: BrowserEnvironment,
    logger: Logger,
    timing: MicrophoneTiming = {},
    owned: readonly Disposable[] = []
  ): MicrophoneManager {
    const platform = new DefaultDevicePlatform(environment)

    return new DefaultMicrophoneManager(
      configuration,
      {
        gate,
        selector: new MicrophoneSelector(),
        visibility: new PageVisibility(environment),
        environment,
        quirks: () => PlatformQuirks.for(platform, 'microphone'),
        timing,
      },
      new ScopedLogger('MicrophoneManager', logger),
      owned
    )
  }

  /** what the microphones that ran on this page reported, by their id */
  private readonly inspected = new Map<string, MicrophoneFeatures>()
  private readonly host: MicrophoneSessionHost

  public constructor(
    configuration: MicrophoneConfiguration,
    private readonly parts: MicrophoneManagerParts,
    logger: Logger,
    owned: readonly Disposable[] = []
  ) {
    super(configuration, parts.gate, logger, owned)

    this.host = {
      restart: (requirements, lease) => this.start(requirements, lease),
      whenVisible: () => parts.visibility.whenVisible(),
    }
  }

  /**
   * The microphones. Never prompts and never starts a microphone; the list is empty until access has been requested.
   *
   * Browsers that list "the default" as an entry of its own, next to the microphone it stands for, get that entry
   * removed: every microphone is listed once, and `isDefault` marks the one the system uses.
   */
  public override async list(): Promise<MicrophoneDescriptor[]> {
    const devices = await this.gate.enumerate()
    const { listed, defaultDevice } = DefaultMicrophoneManager.withoutAliases(devices)

    return listed.map((device) => {
      const descriptor = MicrophoneDescriptor.listed(device, device === defaultDevice)
      const features = this.inspected.get(device.deviceId)

      return features === undefined
        ? descriptor
        : new MicrophoneDescriptor(
            descriptor.id,
            descriptor.groupId,
            descriptor.label,
            'probed',
            descriptor.isDefault,
            features
          )
    })
  }

  public async prepare(requirements?: Partial<MicrophoneRequirements>): Promise<MicrophonePreparation> {
    const { permission, devices: microphones, selected, error } = await this.prepareInput(requirements)

    return selected === undefined ? { permission, microphones, error } : { permission, microphones, selected }
  }

  protected describe(device: MediaDeviceInfo): MicrophoneDescriptor {
    return MicrophoneDescriptor.listed(device, device.deviceId === DefaultMicrophoneManager.defaultId)
  }

  protected accessScopes(): readonly MediaAccessScope[] {
    return ['any']
  }

  protected scopeOf(): MediaAccessScope {
    return 'any'
  }

  protected pick(
    descriptors: readonly MicrophoneDescriptor[],
    requirements: MicrophoneRequirements
  ): MicrophoneDescriptor | undefined {
    return this.parts.selector.select(descriptors, requirements).best
  }

  protected override explainMismatch(
    descriptors: readonly MicrophoneDescriptor[],
    requirements: MicrophoneRequirements
  ): string {
    return this.parts.selector.select(descriptors, requirements).explain()
  }

  protected override constraintsFor(requirements: MicrophoneRequirements): MediaTrackConstraints {
    // SAFETY: TrackConstraints only adds the hardware settings the DOM types do not know yet; the browser takes them
    return MicrophoneConstraints.for(requirements) as MediaTrackConstraints
  }

  /**
   * `default` is the id browsers give "whatever the system uses". The list has no entry of its own for it where it
   * could be matched with a microphone, so the id stands for that microphone.
   */
  protected override find(descriptors: readonly MicrophoneDescriptor[], id: string): MicrophoneDescriptor | undefined {
    return (
      super.find(descriptors, id) ??
      (id === DefaultMicrophoneManager.defaultId ? descriptors.find((descriptor) => descriptor.isDefault) : undefined)
    )
  }

  /**
   * Several tabs can record at once, unless the application asks for the microphones for itself.
   */
  protected override lockMode(requirements: MicrophoneRequirements): LockMode | undefined {
    return requirements.exclusive ? 'exclusive' : undefined
  }

  /**
   * A microphone that runs says what it can do, which is remembered for the page.
   */
  protected override async start(
    requirements: MicrophoneRequirements,
    lease: MediaLease
  ): Promise<MediaInputStart<MicrophoneDescriptor>> {
    const { descriptor, stream } = await super.start(requirements, lease)

    return { descriptor: this.inspect(descriptor, stream), stream }
  }

  protected createSession(
    lease: MediaLease,
    stream: MediaStream,
    requirements: MicrophoneRequirements,
    descriptor: MicrophoneDescriptor
  ): MicrophoneSession {
    return new DefaultMicrophoneSession(
      lease,
      stream,
      descriptor,
      requirements,
      this.parts.quirks(),
      this.host,
      this.parts.environment,
      new ScopedLogger('MicrophoneSession', this.logger),
      this.parts.timing
    )
  }

  /**
   * Removes the entries that stand for another microphone of the list.
   */
  private static withoutAliases(devices: readonly MediaDeviceInfo[]): ListedMicrophones {
    const alias = devices.find((device) => device.deviceId === DefaultMicrophoneManager.defaultId)
    const microphones = devices.filter((device) => !DefaultMicrophoneManager.aliasIds.includes(device.deviceId))

    if (alias === undefined) {
      // without an entry for it, browsers list the default microphone first
      return {
        listed: microphones.length > 0 ? microphones : [...devices],
        defaultDevice: microphones[0] ?? devices[0],
      }
    }

    const target = microphones.find((device) => device.groupId.length > 0 && device.groupId === alias.groupId)

    // an entry that cannot be matched with a microphone stays, it is the only way to open the default
    return target === undefined
      ? { listed: [alias, ...microphones], defaultDevice: alias }
      : { listed: microphones, defaultDevice: target }
  }

  /**
   * Lists the microphones and starts those nothing is known about, for a moment and one after another, if the
   * requirements ask for features the browser does not tell about a listed microphone.
   */
  protected override async candidates(
    requirements: MicrophoneRequirements,
    lease: MediaLease
  ): Promise<MicrophoneDescriptor[]> {
    const listed = await this.list()
    const unseen = listed.filter((descriptor) => descriptor.detail === 'listed' && descriptor.id.length > 0)

    // a microphone that is asked for by its id is started anyway, and looked at then
    if (
      requirements.id !== undefined ||
      unseen.length === 0 ||
      !DefaultMicrophoneManager.asksForFeatures(requirements)
    ) {
      return listed
    }

    try {
      for (const descriptor of unseen) {
        try {
          this.inspect(descriptor, await lease.open({ deviceId: descriptor.id, scope: 'any' }))
        } catch (error) {
          if (error instanceof SessionClosedError) {
            throw error
          }

          this.logger.warn(`Could not look at the microphone '${descriptor.label}'`, error)
        }
      }
    } finally {
      lease.stop()
    }

    return this.list()
  }

  /**
   * Whether the requirements ask for something only the features of a microphone tell. Which one is the default is
   * in the list, and a processing that is switched off is not a feature.
   */
  private static asksForFeatures({ require = {}, prefer = {} }: MicrophoneRequirements): boolean {
    return [require, prefer].some(({ default: _default, ...traits }) =>
      Object.values(traits).some((value) => value !== undefined && value !== false)
    )
  }

  /**
   * Reads what a running microphone reports and remembers it for the page.
   */
  private inspect(descriptor: MicrophoneDescriptor, stream: MediaStream): MicrophoneDescriptor {
    const [track] = stream.getAudioTracks()

    if (track === undefined) {
      return descriptor
    }

    // SAFETY: TrackSettings is what the browser returns plus an index for settings the DOM types do not know
    const probed = descriptor.probedWith(PlatformQuirks.capabilitiesOf(track), track.getSettings() as TrackSettings)
    this.inspected.set(probed.id, probed.features)

    return probed
  }
}
