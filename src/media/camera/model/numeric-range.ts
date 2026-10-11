export interface NumericRangeValues {
  min: number
  max: number
  step?: number
}

/**
 * The values a setting of the hardware can take, for example the zoom. Immutable.
 */
export class NumericRange {
  public constructor(
    public readonly min: number,
    public readonly max: number,
    /** the smallest change the hardware makes; `undefined` where the browser does not say */
    public readonly step?: number
  ) {}

  /**
   * @param value what a browser or a cache reports; anything that is not a range with room in it gives `undefined`
   */
  public static from(value: unknown): NumericRange | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }

    // SAFETY: checked above to be an object; every property is still unknown and checked below
    const { min, max, step } = value as Record<string, unknown>

    if (typeof min !== 'number' || typeof max !== 'number' || !(max > min)) {
      return undefined
    }

    return new NumericRange(min, max, typeof step === 'number' && step > 0 ? step : undefined)
  }

  /**
   * The distance between the ends of the range.
   */
  public get span(): number {
    return this.max - this.min
  }

  /**
   * Whether the value lies in the range, the ends included.
   */
  public contains(value: number): boolean {
    return value >= this.min && value <= this.max
  }

  /**
   * The value of the range that is closest to the given one.
   */
  public clamp(value: number): number {
    return Math.min(this.max, Math.max(this.min, value))
  }

  /**
   * The plain values of the range; `step` only where the range has one.
   */
  public toJSON(): NumericRangeValues {
    return this.step === undefined
      ? { min: this.min, max: this.max }
      : { min: this.min, max: this.max, step: this.step }
  }
}

/**
 * How far a camera zooms. `1` is no zoom on most devices, but the hardware decides.
 */
export type ZoomRange = NumericRange
