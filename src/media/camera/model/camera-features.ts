import type { TrackCapabilities } from '../../session/track-constraints.ts'
import { NumericRange, type NumericRangeValues, type ZoomRange } from './numeric-range.ts'
import { Resolution, type ResolutionLike } from './resolution.ts'

/**
 * The features of a camera as plain data, the way they are kept in the cache.
 */
export interface CameraFeatureValues {
  torch: boolean
  zoom?: NumericRangeValues
  focusModes: readonly string[]
  focusDistance?: NumericRangeValues
  maxResolution?: ResolutionLike
  maxFrameRate?: number
}

/**
 * What one camera can do. Immutable.
 *
 * Whether `torch`, `zoom` and the focus fields mean anything depends on where the features were read from: only a
 * running camera reports them. The `detail` of the descriptor says which it is.
 */
export class CameraFeatures {
  /**
   * The features of a camera nothing is known about.
   */
  public static readonly none = new CameraFeatures({ torch: false, focusModes: [] })

  /**
   * Whether the camera has a light that can stay on.
   */
  public readonly torch: boolean
  /**
   * The zoom levels the camera can be set to, or `undefined` if it cannot zoom.
   */
  public readonly zoom: ZoomRange | undefined
  /** `continuous`, `manual`, `single-shot`, ... as the browser names them */
  public readonly focusModes: readonly string[]
  /**
   * The distances manual focus can be set to, or `undefined` without manual focus.
   */
  public readonly focusDistance: NumericRange | undefined
  /**
   * The largest picture the camera delivers, or `undefined` if the browser does not say.
   */
  public readonly maxResolution: Resolution | undefined
  /** the common resolutions the camera can deliver, largest first */
  public readonly resolutions: readonly Resolution[]
  /**
   * In frames per second, or `undefined` if the browser does not say.
   */
  public readonly maxFrameRate: number | undefined

  public constructor(values: CameraFeatureValues) {
    this.torch = values.torch
    this.zoom = NumericRange.from(values.zoom)
    this.focusModes = [...values.focusModes]
    this.focusDistance = NumericRange.from(values.focusDistance)
    this.maxResolution = Resolution.from(values.maxResolution)
    this.maxFrameRate = values.maxFrameRate

    const max = this.maxResolution
    this.resolutions = max === undefined ? [] : Resolution.common.filter((resolution) => max.covers(resolution))
  }

  /**
   * The single place that interprets what a browser reports about a camera or its running track.
   */
  public static fromCapabilities(capabilities: TrackCapabilities): CameraFeatures {
    const width = CameraFeatures.maxOf(capabilities.width)
    const height = CameraFeatures.maxOf(capabilities.height)

    return new CameraFeatures({
      // a browser reports `true`, older ones a list of the values the torch can take
      torch: [capabilities.torch ?? []].flat().includes(true),
      zoom: NumericRange.from(capabilities.zoom)?.toJSON(),
      focusModes: CameraFeatures.stringsOf(capabilities.focusMode),
      focusDistance: NumericRange.from(capabilities.focusDistance)?.toJSON(),
      maxResolution: width === undefined || height === undefined ? undefined : { width, height },
      maxFrameRate: CameraFeatures.maxOf(capabilities.frameRate),
    })
  }

  /**
   * @param value what was read from the cache, which another version of the library may have written
   * @returns `undefined` if it is not the features of a camera
   */
  public static fromJSON(value: unknown): CameraFeatures | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }

    // SAFETY: checked above to be an object; every property is still unknown and checked below
    const { torch, zoom, focusModes, focusDistance, maxResolution, maxFrameRate } = value as Record<string, unknown>

    if (typeof torch !== 'boolean') {
      return undefined
    }

    return new CameraFeatures({
      torch,
      zoom: NumericRange.from(zoom)?.toJSON(),
      focusModes: CameraFeatures.stringsOf(focusModes),
      focusDistance: NumericRange.from(focusDistance)?.toJSON(),
      maxResolution: Resolution.from(maxResolution)?.toJSON(),
      maxFrameRate: typeof maxFrameRate === 'number' ? maxFrameRate : undefined,
    })
  }

  /**
   * Whether the application can focus the camera: by hand, or by choosing among several modes.
   */
  public get hasFocusControl(): boolean {
    return this.focusDistance !== undefined || this.focusModes.length > 1
  }

  /**
   * Whether this camera has every feature the other one has. Used to tell when a camera that was just started
   * reports everything it is known to have.
   */
  public includes(other: CameraFeatures): boolean {
    return (
      (this.torch || !other.torch) &&
      (this.zoom !== undefined || other.zoom === undefined) &&
      (this.hasFocusControl || !other.hasFocusControl)
    )
  }

  /**
   * The plain values of the features, as they are stored and as `JSON.stringify()` writes them.
   */
  public toJSON(): CameraFeatureValues {
    return {
      torch: this.torch,
      zoom: this.zoom?.toJSON(),
      focusModes: [...this.focusModes],
      focusDistance: this.focusDistance?.toJSON(),
      maxResolution: this.maxResolution?.toJSON(),
      maxFrameRate: this.maxFrameRate,
    }
  }

  private static maxOf(range: unknown): number | undefined {
    // SAFETY: checked in the same expression to be an object; the property is still unknown and checked below
    const max = typeof range === 'object' && range !== null ? (range as Record<string, unknown>).max : undefined

    return typeof max === 'number' && max > 0 ? max : undefined
  }

  private static stringsOf(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []
  }
}
