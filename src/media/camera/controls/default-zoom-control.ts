import { TrackControl } from '../../session/track-control.ts'
import { NumericRange, type ZoomRange } from '../model/numeric-range.ts'
import type { ZoomControl } from './zoom-control.ts'

/**
 * The implementation of {@link ZoomControl}.
 */
export class DefaultZoomControl extends TrackControl implements ZoomControl {
  private static readonly noZoom = new NumericRange(1, 1)
  /** for a camera that does not say how fine it zooms */
  private static readonly defaultStep = 0.1

  public get range(): ZoomRange {
    return NumericRange.from(this.capabilities.zoom) ?? DefaultZoomControl.noZoom
  }

  public get level(): number {
    const level = this.read('zoom')

    return typeof level === 'number' ? level : this.range.min
  }

  public get isMinimum(): boolean {
    return this.level <= this.range.min
  }

  public get isMaximum(): boolean {
    return this.level >= this.range.max
  }

  public set(level: number): Promise<void> {
    return this.apply({ zoom: this.range.clamp(level) })
  }

  public increase(steps = 1): Promise<void> {
    return this.set(this.stepped(steps))
  }

  public decrease(steps = 1): Promise<void> {
    return this.set(this.stepped(-steps))
  }

  private stepped(steps: number): number {
    const step = this.range.step ?? DefaultZoomControl.defaultStep

    // steps like 0.1 do not add up exactly
    return Math.round((this.level + steps * step) * 1000) / 1000
  }
}
