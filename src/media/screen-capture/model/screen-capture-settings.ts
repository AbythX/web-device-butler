import type { TrackSettings } from '../../session/track-constraints.ts'
import type { DisplaySurface } from './screen-capture-requirements.ts'

/**
 * What a capture of the screen delivers right now. The size follows what is shared, so it changes when the user
 * resizes the shared window. Immutable.
 */
export class ScreenCaptureSettings {
  private static readonly surfaces: readonly string[] = ['monitor', 'window', 'browser']

  public constructor(
    /** what the user chose; `undefined` where the browser does not say */
    public readonly surface: DisplaySurface | undefined,
    /** in pixels */
    public readonly width: number | undefined,
    /** in pixels */
    public readonly height: number | undefined,
    /** frames per second */
    public readonly frameRate: number | undefined,
    /** whether the mouse pointer is in the picture; `undefined` where the browser does not say */
    public readonly cursor: boolean | undefined
  ) {}

  /**
   * The settings as a running track reports them.
   */
  public static fromTrack(settings: TrackSettings): ScreenCaptureSettings {
    const { displaySurface, cursor } = settings
    const isKnown = typeof displaySurface === 'string' && ScreenCaptureSettings.surfaces.includes(displaySurface)
    // SAFETY: a surface that is not in the list of the surfaces is not passed on
    const surface = isKnown ? (displaySurface as DisplaySurface) : undefined

    return new ScreenCaptureSettings(
      surface,
      settings.width,
      settings.height,
      settings.frameRate,
      typeof cursor === 'string' ? cursor !== 'never' : undefined
    )
  }

  /**
   * Whether every setting is the same.
   */
  public equals(other: ScreenCaptureSettings): boolean {
    return (
      this.surface === other.surface &&
      this.width === other.width &&
      this.height === other.height &&
      this.frameRate === other.frameRate &&
      this.cursor === other.cursor
    )
  }
}
