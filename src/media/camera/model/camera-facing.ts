import type { TrackCapabilities } from '../../session/track-constraints.ts'

/**
 * - `front`: faces the user
 * - `back`: faces away from the user
 * - `external`: plugged in, it faces wherever it is pointed
 * - `unknown`: the browser does not say, as for the webcam of a laptop
 */
export type CameraFacing = 'front' | 'back' | 'external' | 'unknown'

/**
 * Finds out where a camera faces. The browser says so for some cameras; for the others the label is all there is,
 * and labels are no contract: Android reports `camera2 0, facing back`, iOS reports localized names. The patterns
 * know the names of the languages below; a camera with another name counts as `unknown` until it ran, which says
 * where it faces.
 */
export class CameraFacingDetector {
  // English, German, French, Spanish, Italian, Portuguese, Dutch, Swedish, Polish, Turkish, Russian, Japanese,
  // Chinese, Korean
  private static readonly backLabel =
    /\b(back|rear|environment)|rück|arrière|trasera|posteriore|traseira|achter|bakre|\btyln|\barka\b|задн|背面|后置|後置|후면/i
  private static readonly frontLabel =
    /\bfront|\b(user|selfie)\b|vorder|avant|anteriore|voorzijde|främre|\bprzedni|(?:^|\s)ön\s|передн|фронтальн|前面|前置|전면/i
  private static readonly externalLabel = /\b(usb|external|extern)\b/i

  /**
   * @param capabilities of the device or of its running track
   */
  public static detect(capabilities: TrackCapabilities | undefined, label: string): CameraFacing {
    const reported = CameraFacingDetector.fromCapabilities(capabilities)

    return reported === 'unknown' ? CameraFacingDetector.fromLabel(label) : reported
  }

  /**
   * The side the browser reports through `facingMode`, or `unknown` if it reports none.
   */
  public static fromCapabilities(capabilities: TrackCapabilities | undefined): CameraFacing {
    const modes = new Set<unknown>([capabilities?.facingMode ?? []].flat())

    if (modes.has('environment')) {
      return 'back'
    }

    return modes.has('user') ? 'front' : 'unknown'
  }

  /**
   * The side the name of the camera suggests. Labels are in the language of the system, so this is a guess over
   * the common ones; `external` for a camera that is plugged in.
   */
  public static fromLabel(label: string): CameraFacing {
    if (CameraFacingDetector.backLabel.test(label)) {
      return 'back'
    }

    if (CameraFacingDetector.frontLabel.test(label)) {
      return 'front'
    }

    return CameraFacingDetector.externalLabel.test(label) ? 'external' : 'unknown'
  }
}
