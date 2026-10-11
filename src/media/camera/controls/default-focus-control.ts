import { MediaRequirementsError } from '../../errors/media-requirements-error.ts'
import { TrackControl } from '../../session/track-control.ts'
import { NumericRange } from '../model/numeric-range.ts'
import type { FocusControl } from './focus-control.ts'

/**
 * The implementation of {@link FocusControl}.
 */
export class DefaultFocusControl extends TrackControl implements FocusControl {
  private static readonly manualMode = 'manual'

  public get modes(): readonly string[] {
    const modes = this.capabilities.focusMode

    return Array.isArray(modes) ? modes.filter((mode) => typeof mode === 'string') : []
  }

  public get mode(): string | undefined {
    const mode = this.read('focusMode')

    return typeof mode === 'string' ? mode : undefined
  }

  public setMode(mode: string): Promise<void> {
    if (!this.modes.includes(mode)) {
      return Promise.reject(
        new MediaRequirementsError(
          `The camera has no focus mode '${mode}', only: ${this.modes.join(', ')}`,
          'focusMode'
        )
      )
    }

    return this.apply({ focusMode: mode })
  }

  public get distanceRange(): NumericRange | undefined {
    return NumericRange.from(this.capabilities.focusDistance)
  }

  public get distance(): number | undefined {
    const distance = this.read('focusDistance')

    return typeof distance === 'number' ? distance : undefined
  }

  public setDistance(distance: number): Promise<void> {
    const range = this.distanceRange

    if (range === undefined) {
      return Promise.reject(new MediaRequirementsError('The camera cannot be focused by hand', 'focusDistance'))
    }

    return this.apply({ focusMode: DefaultFocusControl.manualMode, focusDistance: range.clamp(distance) })
  }
}
