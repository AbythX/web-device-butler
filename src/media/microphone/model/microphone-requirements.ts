import type { MediaInputRequirements } from '../../input/media-input-requirements.ts'

/**
 * Features a microphone is asked for. A field that is not set, or set to `false`, asks for nothing.
 */
export interface MicrophoneFeatureRequirements {
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  /** `2` for a stereo microphone */
  minChannelCount?: number
}

export interface MicrophonePreferences extends MicrophoneFeatureRequirements {
  /** the microphone the user chose as the default of the system */
  default?: boolean
}

/**
 * The processing of the sound, switched on or off. A field that is not set leaves the decision to the browser,
 * which switches on what the microphone has.
 */
export interface MicrophoneProcessing {
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

/**
 * What an application asks of a microphone. The same shape is the `microphone` section of the configuration (the
 * defaults) and the argument of `open()` and `select()` (the overrides for one call).
 */
export interface MicrophoneRequirements extends MediaInputRequirements {
  /** a microphone without these is never returned */
  require?: MicrophoneFeatureRequirements
  /** among the microphones that have what is required, those with these are ranked higher */
  prefer?: MicrophonePreferences
  /** what the session starts with; `session.processing` changes it later */
  processing?: MicrophoneProcessing
  /** the closest the microphone can do */
  channelCount?: number
  /** in hertz, the closest the microphone can do */
  sampleRate?: number
  /**
   * Keep the other tabs of the application away from the microphones while the session runs. Default: `false`,
   * several tabs can record at once.
   */
  exclusive?: boolean
  /**
   * Start the microphone again when the system ends it. Default: `false`, the session ends.
   */
  autoRecover?: boolean
}

/**
 * The `microphone` section of the configuration passed to `DefaultDeviceButler.create()`.
 */
export type MicrophoneConfiguration = Omit<MicrophoneRequirements, 'signal'>
