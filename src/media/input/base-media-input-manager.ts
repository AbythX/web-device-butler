import '../../core/disposable-polyfill.ts'

import type { LockMode } from '../../core/coordination/lock/lock-manager-like.ts'
import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import type { DevicePermissionState } from '../../permission/permission-state.ts'
import type { MediaAccess, MediaAvailability } from '../access/media-access.ts'
import type { MediaAccessScope, MediaAccessState } from '../access/media-access-state.ts'
import { MediaLease, type MediaOpenRequest } from '../access/media-lease.ts'
import { MediaDeviceBusyError } from '../errors/media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import type { MediaSession } from '../session/media-session.ts'
import type { MediaInputDescriptor } from './media-input-descriptor.ts'
import type { MediaInputRequirements } from './media-input-requirements.ts'
import type {
  MediaInputManager,
  MediaInputManagerEvents,
  MediaInputPreparation,
  MediaInputStart,
} from './media-input-manager.ts'

/**
 * The base of the implementations of {@link MediaInputManager}.
 */
export abstract class BaseMediaInputManager<
  TDescriptor extends MediaInputDescriptor,
  TSession extends MediaSession,
  TRequirements extends MediaInputRequirements = MediaInputRequirements,
>
  extends EventEmitter<MediaInputManagerEvents<TDescriptor>>
  implements MediaInputManager<TDescriptor, TSession, TRequirements>
{
  private defaults: TRequirements
  private readonly sessions = new Set<TSession>()
  private readonly forwarded = new Map<keyof MediaInputManagerEvents<TDescriptor>, EventSubscription>()

  /**
   * @param configuration the defaults of every call
   * @param gate the access gate of the kind of device
   * @param owned what is disposed together with the manager, because nobody else owns it. A gate that is shared
   *   with the rest of the `DeviceButler` is not among it.
   */
  protected constructor(
    configuration: TRequirements,
    protected readonly gate: MediaAccess,
    protected readonly logger: Logger,
    private readonly owned: readonly Disposable[] = []
  ) {
    super()
    // SAFETY: every field of requirements is optional, so the empty object is one for every kind of device
    this.defaults = this.merge({} as TRequirements, configuration)
  }

  public get configuration(): Readonly<TRequirements> {
    return this.defaults
  }

  public configure(changes: Partial<TRequirements>): void {
    this.defaults = this.merge(this.defaults, changes)
  }

  public get access(): MediaAccessState {
    return this.gate.state
  }

  public get availability(): MediaAvailability {
    return this.gate.availability
  }

  public refreshAvailability(): Promise<MediaAvailability> {
    return this.gate.refreshAvailability()
  }

  public requestAccess(requirements?: Partial<TRequirements>): Promise<MediaAccessState> {
    const merged = this.merge(this.defaults, requirements)

    return this.gate.requestAccess(this.accessScopes(merged), {
      whenBusy: merged.whenBusy,
      signal: requirements?.signal,
    })
  }

  public async list(): Promise<TDescriptor[]> {
    const devices = await this.gate.enumerate()

    return devices.map((device) => this.describe(device))
  }

  public async select(requirements?: Partial<TRequirements>): Promise<TDescriptor | undefined> {
    const merged = this.merge(this.defaults, requirements)

    try {
      return this.choose(await this.survey(merged, requirements?.signal), merged)
    } catch (error) {
      if (MediaLease.isAnswer(error)) {
        return undefined
      }

      throw error
    }
  }

  public async open(requirements?: Partial<TRequirements>): Promise<TSession> {
    const merged = this.merge(this.defaults, requirements)

    const lease = await this.gate.acquire({
      whenBusy: merged.whenBusy,
      mode: this.lockMode(merged),
      signal: requirements?.signal,
    })

    try {
      const { descriptor, stream } = await this.start(merged, lease)

      return this.keep(this.createSession(lease, stream, merged, descriptor))
    } catch (error) {
      await lease.release()
      throw error
    }
  }

  public dispose(): Promise<void> {
    const closed = Promise.allSettled([...this.sessions].map((session) => session.close())).then(() => undefined)
    this.sessions.clear()
    this.removeAllListeners()
    this.owned.forEach((owned) => owned[Symbol.dispose]())

    return closed
  }

  /**
   * Calls {@link dispose} without waiting for it, so the manager can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    void this.dispose()
  }

  /**
   * Turns what the browser lists into the descriptor of the kind.
   */
  protected abstract describe(device: MediaDeviceInfo): TDescriptor

  /**
   * The access the requirements need, in the order in which it is requested.
   */
  protected abstract accessScopes(requirements: TRequirements): readonly MediaAccessScope[]

  /**
   * The access a device needs before it may be opened by its id.
   */
  protected abstract scopeOf(descriptor: TDescriptor): MediaAccessScope

  /**
   * The device that fits the requirements best.
   */
  protected abstract pick(descriptors: readonly TDescriptor[], requirements: TRequirements): TDescriptor | undefined

  /**
   * @param lease holds the device; the session releases it when it ends
   * @param descriptor the device the stream comes from
   */
  protected abstract createSession(
    lease: MediaLease,
    stream: MediaStream,
    requirements: TRequirements,
    descriptor: TDescriptor
  ): TSession

  /**
   * How a session holds the device: `exclusive` keeps other tabs out, `shared` lets them in. Default: the mode of
   * the gate.
   */
  protected lockMode(_requirements: TRequirements): LockMode | undefined {
    return undefined
  }

  /**
   * What the device is asked to deliver.
   */
  protected constraintsFor(requirements: TRequirements, _descriptor: TDescriptor): MediaTrackConstraints {
    return requirements.constraints ?? {}
  }

  /**
   * The devices a call chooses from. The lease is there for a subclass that has to start devices to describe them;
   * access has been requested by the caller.
   */
  protected candidates(_requirements: TRequirements, _lease: MediaLease): Promise<TDescriptor[]> {
    return this.list()
  }

  /**
   * What is known about the devices while they are held and cannot be asked.
   */
  protected remembered(): Promise<TDescriptor[]> {
    return this.list()
  }

  /**
   * The device an application asks for by its id.
   */
  protected find(descriptors: readonly TDescriptor[], id: string): TDescriptor | undefined {
    return descriptors.find((descriptor) => descriptor.id === id)
  }

  /**
   * Why none of the devices fits, for the message of the error.
   */
  protected explainMismatch(descriptors: readonly TDescriptor[], _requirements: TRequirements): string {
    return `None of the ${descriptors.length} ${this.gate.kind}s fits the requirements`
  }

  /**
   * The device of the requirements among the given ones: the one with the id they name, otherwise the best fit.
   */
  protected choose(descriptors: readonly TDescriptor[], requirements: TRequirements): TDescriptor | undefined {
    const { id } = requirements

    return id === undefined ? this.pick(descriptors, requirements) : this.find(descriptors, id)
  }

  /**
   * Requests access and finds out about the devices what the requirements need to know. No device runs afterwards.
   *
   * Looking at devices never interrupts a session, in this tab or another. If the devices are held, the answer is
   * what is {@link remembered}; only without any of that the busy policy of the requirements applies.
   */
  protected async survey(requirements: TRequirements, signal?: AbortSignal): Promise<TDescriptor[]> {
    let lease: MediaLease

    try {
      lease = await this.gate.acquire({ whenBusy: 'fail', signal })
    } catch (error) {
      if (!(error instanceof MediaDeviceBusyError)) {
        throw error
      }

      const known = await this.remembered()

      if (known.length > 0) {
        return known
      }

      if (requirements.whenBusy === undefined || requirements.whenBusy === 'fail') {
        throw error
      }

      lease = await this.gate.acquire({ whenBusy: requirements.whenBusy, signal })
    }

    try {
      await lease.ensureAccess(this.accessScopes(requirements))

      return await this.candidates(requirements, lease)
    } finally {
      await lease.release()
    }
  }

  /**
   * Does the slow and visible work of {@link open} up front: requests access, looks at the devices and says which
   * one would be started. It reports instead of throwing, except for a call that was aborted through its signal.
   */
  protected async prepareInput(
    requirements?: Partial<TRequirements>
  ): Promise<MediaInputPreparation<TDescriptor, TRequirements>> {
    const merged = this.merge(this.defaults, requirements)

    try {
      const devices = await this.survey(merged, requirements?.signal)
      const selected = this.choose(devices, merged)
      const permission = this.permissionFor(merged)

      if (selected !== undefined) {
        return { requirements: merged, permission, devices, selected }
      }

      const reason =
        merged.id === undefined
          ? this.explainMismatch(devices, merged)
          : `There is no ${this.gate.kind} with the id '${merged.id}'`

      return { requirements: merged, permission, devices, error: new MediaRequirementsError(reason) }
    } catch (error) {
      if (!(error instanceof DeviceButlerError)) {
        throw error
      }

      const permission = error instanceof UnsupportedError ? 'unsupported' : this.permissionFor(merged)

      return { requirements: merged, permission, devices: [], error }
    }
  }

  /**
   * Decides which device is opened. Access comes first: before it, the browser lists nothing to choose from.
   */
  protected async resolve(requirements: TRequirements, lease: MediaLease): Promise<TDescriptor> {
    await lease.ensureAccess(this.accessScopes(requirements))
    const descriptors = await this.candidates(requirements, lease)

    const descriptor = this.choose(descriptors, requirements)

    if (descriptor !== undefined) {
      return descriptor
    }

    throw requirements.id === undefined
      ? new MediaRequirementsError(this.explainMismatch(descriptors, requirements))
      : new MediaDeviceNotFoundError(`There is no ${this.gate.kind} with the id '${requirements.id}'`)
  }

  /**
   * Chooses a device and starts it on the lease, which stops what the lease ran before.
   */
  protected async start(requirements: TRequirements, lease: MediaLease): Promise<MediaInputStart<TDescriptor>> {
    const descriptor = await this.resolve(requirements, lease)

    return { descriptor, stream: await lease.open(this.requestFor(descriptor, requirements)) }
  }

  protected override onFirstListener(type: keyof MediaInputManagerEvents<TDescriptor>): void {
    this.forwarded.set(type, this.forward(type))
  }

  protected override onLastListenerRemoved(type: keyof MediaInputManagerEvents<TDescriptor>): void {
    this.forwarded.get(type)?.unsubscribe()
    this.forwarded.delete(type)
  }

  private forward(type: keyof MediaInputManagerEvents<TDescriptor>): EventSubscription {
    switch (type) {
      case 'accesschange':
        return this.gate.on(type, (state) => this.emitSafely(type, state, this.logger))
      case 'availabilitychange':
        return this.gate.on(type, (availability) => this.emitSafely(type, availability, this.logger))
      default:
        return this.gate.on('devicechange', () => void this.announceDevices())
    }
  }

  /**
   * The browser grants and refuses a kind of device as a whole, so one answer stands for every scope.
   */
  private permissionFor(requirements: TRequirements): DevicePermissionState {
    const statuses = new Set(this.accessScopes(requirements).map((scope) => this.access.of(scope)))

    if (statuses.has('granted')) {
      return 'granted'
    }

    return statuses.has('denied') ? 'denied' : 'unknown'
  }

  private async announceDevices(): Promise<void> {
    try {
      this.emitSafely('change', await this.list(), this.logger)
    } catch (error) {
      this.logger.error(`Could not list the ${this.gate.kind}s after a device changed`, error)
    }
  }

  protected requestFor(descriptor: TDescriptor, requirements: TRequirements): MediaOpenRequest {
    return {
      // some browsers list a device without an id; then the browser picks among the devices of the scope
      deviceId: descriptor.id.length > 0 ? descriptor.id : undefined,
      scope: this.scopeOf(descriptor),
      constraints: this.constraintsFor(requirements, descriptor),
    }
  }

  private keep(session: TSession): TSession {
    this.sessions.add(session)
    session.once('ended', () => this.sessions.delete(session))

    return session
  }

  /**
   * Fields that are not set do not replace anything. The signal belongs to a single call and is never kept.
   */
  protected merge(base: TRequirements, changes: Partial<TRequirements> | undefined): TRequirements {
    const merged: TRequirements = { ...base }

    // SAFETY: changes is a Partial of the requirements, so its keys are keys of the requirements
    for (const key of Object.keys(changes ?? {}) as (keyof TRequirements)[]) {
      const value = changes?.[key]

      if (value !== undefined && key !== 'signal') {
        merged[key] = value
      }
    }

    return merged
  }
}
