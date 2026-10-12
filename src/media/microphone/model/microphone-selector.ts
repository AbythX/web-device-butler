import { MediaInputSelection, type MediaInputRejection } from '../../input/media-input-selection.ts'
import type { MicrophoneDescriptor } from './microphone-descriptor.ts'
import type { MicrophoneRequirements } from './microphone-requirements.ts'

export type MicrophoneRejection = MediaInputRejection<MicrophoneDescriptor>

/**
 * The outcome of a selection: the microphones that fit, best first, and why the others do not.
 */
export class MicrophoneSelection extends MediaInputSelection<MicrophoneDescriptor> {
  public constructor(ranked: readonly MicrophoneDescriptor[], rejected: readonly MicrophoneRejection[]) {
    super('microphone', ranked, rejected)
  }
}

/**
 * Filters and ranks microphones against requirements.
 */
export class MicrophoneSelector {
  /**
   * The microphones that have everything that is required, ordered by how many of the preferred traits they have,
   * then the default microphone of the system first, then by the order of the list.
   */
  public select(
    descriptors: readonly MicrophoneDescriptor[],
    requirements: MicrophoneRequirements
  ): MicrophoneSelection {
    const fitting: MicrophoneDescriptor[] = []
    const rejected: MicrophoneRejection[] = []

    for (const descriptor of descriptors) {
      const reasons = descriptor.unmet(requirements)

      if (reasons.length === 0) {
        fitting.push(descriptor)
      } else {
        rejected.push({ descriptor, reasons })
      }
    }

    const { prefer = {} } = requirements

    const score = (descriptor: MicrophoneDescriptor) => descriptor.missing(prefer).length

    // the sort is stable, so microphones that rank the same keep the order of the list
    return new MicrophoneSelection(
      [...fitting].sort(
        (first, second) => score(first) - score(second) || Number(second.isDefault) - Number(first.isDefault)
      ),
      rejected
    )
  }
}
