import type { TrackConstraints } from '../../session/track-constraints.ts'
import type { CameraRequirements } from '../model/camera-requirements.ts'

/**
 * Turns what an application asks of the picture into the constraints of the browser.
 */
export class CameraConstraints {
  /**
   * The raw constraints of the requirements come first, so a field of the library wins over the same constraint
   * written by hand.
   */
  public static for(
    requirements: Pick<CameraRequirements, 'resolution' | 'frameRate' | 'constraints'>
  ): TrackConstraints {
    // SAFETY: TrackConstraints is MediaTrackConstraints plus the settings the DOM types do not know; a copy of one is
    // one
    const constraints = { ...requirements.constraints } as TrackConstraints

    const { resolution, frameRate } = requirements

    if (resolution !== undefined) {
      const strictness = resolution.mode === 'exact' ? 'exact' : 'ideal'
      constraints.width = { [strictness]: resolution.width }
      constraints.height = { [strictness]: resolution.height }
    }

    if (frameRate !== undefined) {
      constraints.frameRate = { ideal: frameRate }
    }

    return constraints
  }
}
