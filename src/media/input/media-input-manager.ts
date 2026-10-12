import type { Listenable } from '../../core/events/listenable.ts'

import type { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import type { DevicePermissionState } from '../../permission/permission-state.ts'
import type { MediaAvailability } from '../access/media-access.ts'
import type { MediaAccessState } from '../access/media-access-state.ts'
import type { MediaSession } from '../session/media-session.ts'
import type { MediaInputDescriptor } from './media-input-descriptor.ts'
import type { MediaInputRequirements } from './media-input-requirements.ts'

export interface MediaInputManagerEvents<TDescriptor> {
  /** a device was plugged in or removed; the payload is the new list */
  change: readonly TDescriptor[]
  accesschange: MediaAccessState
  availabilitychange: MediaAvailability
}

/**
 * A device that was chosen and started.
 */
export interface MediaInputStart<TDescriptor> {
  readonly descriptor: TDescriptor
  readonly stream: MediaStream
}

/**
 * What preparing a kind of device found out; the managers report it in the words of their kind.
 */
export interface MediaInputPreparation<TDescriptor, TRequirements> {
  /** the requirements of the call, merged over the configured defaults */
  readonly requirements: TRequirements
  readonly permission: DevicePermissionState
  readonly devices: readonly TDescriptor[]
  /** the device `open()` would start; `undefined` if none fits */
  readonly selected?: TDescriptor
  /** why there is no selected device */
  readonly error?: DeviceButlerError
}

/**
 * What the camera manager and the microphone manager have in common: listing the devices, watching them, selecting
 * one by requirements and opening sessions. How a device is described and which one fits depends on its kind.
 */
export interface MediaInputManager<
  TDescriptor extends MediaInputDescriptor,
  TSession extends MediaSession,
  TRequirements extends MediaInputRequirements = MediaInputRequirements,
>
  extends Listenable<MediaInputManagerEvents<TDescriptor>>, Disposable {
  /**
   * The current defaults: what `open()` and `select()` use where a call does not say otherwise.
   */
  readonly configuration: Readonly<TRequirements>

  /**
   * Replaces single fields of the defaults. Sessions that are open keep what they were opened with.
   */
  configure(changes: Partial<TRequirements>): void

  /**
   * How far access was requested on this page.
   */
  readonly access: MediaAccessState

  /**
   * Whether the device is free as far as the tabs of this library are concerned. Kept current while someone listens
   * to `availabilitychange`; otherwise it is the last known value, and reading it starts a check in the background.
   */
  readonly availability: MediaAvailability

  /**
   * Finds out now whether the device is free, instead of answering with the last known value.
   *
   * @returns the availability, which is also what {@link availability} holds afterwards
   */
  refreshAvailability(): Promise<MediaAvailability>

  /**
   * Requests the access the requirements need. This can show the permission prompt of the browser and starts a
   * device for a moment. Refusals do not reject; the returned state tells.
   *
   * @throws MediaDeviceBusyError if the device is held and the busy policy does not get it
   * @throws UnsupportedError where the browser has no cameras and microphones for this page
   */
  requestAccess(requirements?: Partial<TRequirements>): Promise<MediaAccessState>

  /**
   * The devices of the kind. Never prompts and never starts a device. The list is empty until access has been requested;
   * `access` says why.
   */
  list(): Promise<TDescriptor[]>

  /**
   * The device that fits the requirements best, or `undefined` if none does. Requests the access it needs and,
   * where the requirements ask for something only a running device tells, starts the devices that were not looked
   * at yet, one after another.
   *
   * A device that another tab holds is not interrupted for that: then the answer comes from what is known already.
   *
   * @throws MediaDeviceBusyError if the device is held, nothing is known and the busy policy does not get it
   */
  select(requirements?: Partial<TRequirements>): Promise<TDescriptor | undefined>

  /**
   * Starts the device that fits the requirements and returns the session that owns it. The requirements are merged
   * over the configured defaults.
   *
   * @throws MediaRequirementsError if no device fits
   * @throws MediaDeviceNotFoundError if there is no device of the kind, or none with the `id` that was asked for
   * @throws MediaDeviceBusyError if the device is held and the busy policy does not get it
   * @throws PermissionDeniedError if access was refused
   */
  open(requirements?: Partial<TRequirements>): Promise<TSession>

  /**
   * Closes every session of the manager.
   *
   * @returns a promise that resolves once the devices of the sessions are free for others
   */
  dispose(): Promise<void>
}
