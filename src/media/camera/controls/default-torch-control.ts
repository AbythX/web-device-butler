import { TrackControl } from '../../session/track-control.ts'
import type { TorchControl } from './torch-control.ts'

/**
 * The implementation of {@link TorchControl}.
 */
export class DefaultTorchControl extends TrackControl implements TorchControl {
  public get enabled(): boolean {
    return this.read('torch') === true
  }

  public set(enabled: boolean): Promise<void> {
    return this.apply({ torch: enabled })
  }

  public async toggle(): Promise<boolean> {
    await this.set(!this.enabled)

    return this.enabled
  }
}
