import type { TrackConstraints } from '../../session/track-constraints.ts'
import { MicrophoneFeatures } from '../model/microphone-features.ts'
import type { MicrophoneRequirements } from '../model/microphone-requirements.ts'

/**
 * Turns what an application asks of the sound into the constraints of the browser.
 */
export class MicrophoneConstraints {
  /**
   * The raw constraints of the requirements come first, so a field of the library wins over the same constraint
   * written by hand.
   */
  public static for(
    requirements: Pick<MicrophoneRequirements, 'processing' | 'channelCount' | 'sampleRate' | 'constraints'>
  ): TrackConstraints {
    // SAFETY: TrackConstraints is MediaTrackConstraints plus the settings the DOM types do not know; a copy of one is
    // one
    const constraints = { ...requirements.constraints } as TrackConstraints

    const { processing = {}, channelCount, sampleRate } = requirements

    for (const name of MicrophoneFeatures.processingNames) {
      const value = processing[name]

      if (value !== undefined) {
        constraints[name] = value
      }
    }

    if (channelCount !== undefined) {
      constraints.channelCount = { ideal: channelCount }
    }

    if (sampleRate !== undefined) {
      constraints.sampleRate = { ideal: sampleRate }
    }

    return constraints
  }
}
