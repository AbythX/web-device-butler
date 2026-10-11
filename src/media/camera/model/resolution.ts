/**
 * A resolution as plain data, the way an application writes it in its configuration.
 */
export interface ResolutionLike {
  width: number
  height: number
}

/**
 * The size of the picture a camera delivers. Immutable.
 */
export class Resolution implements ResolutionLike {
  /**
   * The resolutions applications usually offer, largest first.
   */
  public static readonly common: readonly Resolution[] = [
    new Resolution(3840, 2160),
    new Resolution(2560, 1440),
    new Resolution(1920, 1080),
    new Resolution(1280, 720),
    new Resolution(960, 540),
    new Resolution(640, 480),
    new Resolution(640, 360),
    new Resolution(320, 240),
  ]

  public constructor(
    public readonly width: number,
    public readonly height: number
  ) {}

  /**
   * @param value what a browser or a cache reports; anything that is not a resolution gives `undefined`
   */
  public static from(value: unknown): Resolution | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }

    // SAFETY: checked above to be an object; every property is still unknown and checked below
    const { width, height } = value as Record<string, unknown>

    return typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0
      ? new Resolution(width, height)
      : undefined
  }

  /**
   * Width times height.
   */
  public get pixels(): number {
    return this.width * this.height
  }

  /**
   * Whether a picture of the other size fits into this one. A phone that is held upright swaps width and height, so
   * the longer sides and the shorter sides are compared with each other.
   */
  public covers(other: ResolutionLike): boolean {
    return (
      Math.max(this.width, this.height) >= Math.max(other.width, other.height) &&
      Math.min(this.width, this.height) >= Math.min(other.width, other.height)
    )
  }

  /**
   * Whether width and height are the same. A resolution that is turned by 90 degrees is a different one.
   */
  public equals(other: ResolutionLike | undefined): boolean {
    return other !== undefined && this.width === other.width && this.height === other.height
  }

  /**
   * The plain width and height.
   */
  public toJSON(): ResolutionLike {
    return { width: this.width, height: this.height }
  }

  /**
   * For messages, in the form `1920x1080`.
   */
  public toString(): string {
    return `${this.width}x${this.height}`
  }
}
