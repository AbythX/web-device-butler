import type { TrackSettings } from '../../session/track-constraints.ts'
import { Resolution } from './resolution.ts'

/**
 * What a running camera delivers right now, which can differ from what was asked for. Immutable.
 */
export class CameraSettings {
  public constructor(
    public readonly width: number | undefined,
    public readonly height: number | undefined,
    public readonly frameRate: number | undefined
  ) {}

  /**
   * The settings as a running track reports them.
   */
  public static fromTrack(settings: TrackSettings): CameraSettings {
    return new CameraSettings(settings.width, settings.height, settings.frameRate)
  }

  /**
   * `undefined` where the browser does not report the size of the picture.
   */
  public get resolution(): Resolution | undefined {
    return Resolution.from({ width: this.width, height: this.height })
  }

  /**
   * Whether size and frame rate are the same.
   */
  public equals(other: CameraSettings): boolean {
    return this.width === other.width && this.height === other.height && this.frameRate === other.frameRate
  }
}
