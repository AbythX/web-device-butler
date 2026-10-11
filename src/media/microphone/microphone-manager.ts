import type { DeviceEnvironment } from '../../core/environment/device-environment.ts'
import type { PageVisibility } from '../../core/environment/page-visibility.ts'
import type { MediaAccess } from '../access/media-access.ts'
import type { MediaInputManager } from '../input/media-input-manager.ts'
import type { PlatformQuirk } from '../quirks/platform-quirk.ts'
import type { MicrophoneInitialization } from './microphone-initialization.ts'
import type { MicrophoneDescriptor } from './model/microphone-descriptor.ts'
import type { MicrophoneRequirements } from './model/microphone-requirements.ts'
import type { MicrophoneSelector } from './model/microphone-selector.ts'
import type { MicrophoneSession, MicrophoneTiming } from './session/microphone-session.ts'

/**
 * What a microphone manager works with. `DefaultDevice.create()` and `DefaultMicrophoneManager.create()` build these.
 */
export interface MicrophoneManagerParts {
  /** the access gate of the microphones */
  readonly gate: MediaAccess
  readonly selector: MicrophoneSelector
  readonly visibility: PageVisibility
  readonly environment: DeviceEnvironment
  /** the quirks a new session is composed with */
  quirks(): PlatformQuirk[]
  readonly timing?: MicrophoneTiming
}

/**
 * The entry to the microphones (`device.microphone`): lists them, selects one by the features an application needs
 * and opens sessions.
 */
export interface MicrophoneManager extends MediaInputManager<
  MicrophoneDescriptor,
  MicrophoneSession,
  MicrophoneRequirements
> {
  /**
   * Requests access, finds out what the microphones can do as far as the requirements need it, and says which
   * microphone `open()` would start. No microphone runs afterwards.
   *
   * It reports instead of throwing, except for a call that was aborted through its signal.
   */
  initialize(requirements?: Partial<MicrophoneRequirements>): Promise<MicrophoneInitialization>
}
