import type { TrackConstraints } from '../../session/track-constraints.ts'
import { MicrophoneFeatures } from '../model/microphone-features.ts'
import type { MicrophoneRequirements } from '../model/microphone-requirements.ts'

/**
 * Turns what an application asks of the sound into the constraints of the browser.
 */
export class MicrophoneConstraints {
  /**
   * A processing is switched the way `require` says, and the way `prefer` says where `require` leaves it open. The
   * channel count and the sample rate are the preferred ones, the closest the microphone can do, and the required
   * ones where none is preferred.
   *
   * The raw constraints of the requirements come first, so a field of the library wins over the same constraint
   * written by hand.
   */
  public static for(
    requirements: Pick<MicrophoneRequirements, 'require' | 'prefer' | 'constraints'>
  ): TrackConstraints {
    // SAFETY: TrackConstraints is MediaTrackConstraints plus the settings the DOM types do not know; a copy of one is
    // one
    const constraints = { ...requirements.constraints } as TrackConstraints

    const { require = {}, prefer = {} } = requirements

    for (const name of MicrophoneFeatures.processingNames) {
      const value = require[name] ?? prefer[name]

      if (value !== undefined) {
        constraints[name] = value
      }
    }

    const channelCount = prefer.channelCount ?? require.channelCount
    const sampleRate = prefer.sampleRate ?? require.sampleRate

    if (channelCount !== undefined) {
      constraints.channelCount = { ideal: channelCount }
    }

    if (sampleRate !== undefined) {
      constraints.sampleRate = { ideal: sampleRate }
    }

    return constraints
  }
}
