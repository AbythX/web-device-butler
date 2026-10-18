import type { MediaLease } from '../../access/media-lease.ts'
import type { MediaInputStart } from '../../input/media-input-manager.ts'
import type { MediaSession, MediaSessionEvents } from '../../session/media-session.ts'
import type { ProcessingControl } from '../controls/processing-control.ts'
import type { LevelMeter } from '../level/level-meter.ts'
import type { MicrophoneDescriptor } from '../model/microphone-descriptor.ts'
import type { MicrophoneRequirements } from '../model/microphone-requirements.ts'
import type { MicrophoneSettings } from '../model/microphone-settings.ts'

export interface MicrophoneSessionEvents extends MediaSessionEvents {
  /** the microphone delivers something else than before, for example without noise suppression */
  settingschange: MicrophoneSettings
  /** the application muted or unmuted the microphone */
  mutechange: boolean
}

/**
 * What a session needs from the manager that created it.
 */
export interface MicrophoneSessionHost {
  /** chooses the microphone that fits the requirements and starts it on the lease */
  restart(requirements: MicrophoneRequirements, lease: MediaLease): Promise<MediaInputStart<MicrophoneDescriptor>>
  /** resolves once the user can see the page */
  whenVisible(): Promise<void>
}

/**
 * One running microphone.
 */
export interface MicrophoneSession extends MediaSession<MicrophoneSessionEvents> {
  /**
   * Switches the processing of the sound on and off.
   */
  readonly processing: ProcessingControl

  /**
   * Measures how loud the microphone is while someone listens to its `change` event. `undefined` where the browser
   * has no Web Audio.
   */
  readonly level: LevelMeter | undefined

  /**
   * The microphone the session runs.
   */
  readonly descriptor: MicrophoneDescriptor

  /**
   * What the microphone delivers, read from the microphone on every access.
   */
  readonly settings: MicrophoneSettings

  /**
   * Whether the application silenced the microphone. The microphone keeps running and delivers silence; `state`
   * stays `live`. This is not the `muted` state of the session, which is the system pausing the device.
   */
  muted: boolean
}
