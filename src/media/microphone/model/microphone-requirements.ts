import type { MediaInputRequirements } from '../../input/media-input-requirements.ts'

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
 * What can be asked of a microphone. The same shape says what a microphone must have (`require`) and what it should
 * have (`prefer`).
 *
 * A processing that is `true` asks for a microphone that has it, and the session starts with it switched on.
 * `false` switches it off and says nothing about which microphone is chosen. A field that is not set leaves the
 * decision to the browser.
 */
export interface MicrophoneTraits extends MicrophoneProcessing {
  /** the microphone the user chose as the default of the system */
  default?: boolean
  /** `2` for a stereo microphone */
  channelCount?: number
  /** in hertz */
  sampleRate?: number
}

/**
 * What an application asks of a microphone. The same shape is the `microphone` section of the configuration (the
 * defaults) and the argument of `open()` and `select()` (the overrides for one call).
 *
 * The preferred channel count and sample rate are also what the running microphone is asked to deliver, the
 * closest it can do; where none is preferred, the required one is. A processing that both name is taken from
 * `require`.
 */
export interface MicrophoneRequirements extends MediaInputRequirements {
  /** a microphone without these is never returned */
  require?: MicrophoneTraits
  /** among the microphones that have what is required, those with these are ranked higher */
  prefer?: MicrophoneTraits
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
