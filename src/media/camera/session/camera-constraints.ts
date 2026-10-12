import type { TrackConstraints } from '../../session/track-constraints.ts'
import type { CameraRequirements, CameraTraits } from '../model/camera-requirements.ts'

/**
 * What a camera is asked to deliver.
 */
export type CameraDelivery = Pick<CameraTraits, 'width' | 'height' | 'frameRate'>

/**
 * Turns what an application asks of the picture into the constraints of the browser.
 */
export class CameraConstraints {
  private static readonly names = ['width', 'height', 'frameRate'] as const

  /**
   * What the running camera is asked to deliver: the preferred width, height and frame rate, and the required one
   * where none is preferred.
   */
  public static delivery({
    require = {},
    prefer = {},
  }: Pick<CameraRequirements, 'require' | 'prefer'>): CameraDelivery {
    const delivery: CameraDelivery = {}

    for (const name of CameraConstraints.names) {
      const value = prefer[name] ?? require[name]

      if (value !== undefined) {
        delivery[name] = value
      }
    }

    return delivery
  }

  /**
   * The camera is asked for the closest it can do. The raw constraints of the requirements come first, so a field
   * of the library wins over the same constraint written by hand.
   */
  public static for(requirements: Pick<CameraRequirements, 'require' | 'prefer' | 'constraints'>): TrackConstraints {
    // SAFETY: TrackConstraints is MediaTrackConstraints plus the settings the DOM types do not know; a copy of one is
    // one
    const constraints = { ...requirements.constraints } as TrackConstraints

    for (const [name, value] of Object.entries(CameraConstraints.delivery(requirements))) {
      // SAFETY: the entries of a delivery are named after the constraints they become
      constraints[name as keyof CameraDelivery] = { ideal: value }
    }

    return constraints
  }
}
