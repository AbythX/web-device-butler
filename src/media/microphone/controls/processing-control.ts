import type { MicrophoneProcessingName } from '../model/microphone-features.ts'
import type { MicrophoneProcessing } from '../model/microphone-requirements.ts'

/**
 * The processing a browser applies to the sound of a running microphone: echo cancellation, noise suppression and
 * automatic gain control.
 */
export interface ProcessingControl {
  /**
   * The processing this microphone has, whether it is on or off.
   */
  readonly available: readonly MicrophoneProcessingName[]

  /**
   * Read from the microphone, not remembered.
   */
  readonly echoCancellation: boolean

  /**
   * Read from the microphone, not remembered.
   */
  readonly noiseSuppression: boolean

  /**
   * Read from the microphone, not remembered.
   */
  readonly autoGainControl: boolean

  /**
   * Whether the microphone does what the changes ask for.
   */
  matches(changes: MicrophoneProcessing): boolean

  /**
   * Whether the microphone can do what the changes ask for, as far as the browser tells. A browser that does not
   * list a processing leaves that open, which counts as yes.
   */
  supports(changes: MicrophoneProcessing): boolean

  /**
   * Switches processing on or off. A field that is not set stays as it is.
   *
   * Some browsers accept such a change for a running microphone without making it. The session then starts the
   * microphone again with the new processing: the same session, a new track, a short gap in the sound. The getters
   * say what the microphone does afterwards.
   */
  set(changes: MicrophoneProcessing): Promise<void>
}
