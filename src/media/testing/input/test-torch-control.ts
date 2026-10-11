import { TrackControl } from '../../session/track-control.ts'

/**
 * The smallest control, to test the abstract base through.
 */
export class TestTorchControl extends TrackControl {
  public get isAvailable(): boolean {
    return this.capabilities.torch === true
  }

  public get enabled(): boolean {
    return this.settings.torch === true
  }

  public set(enabled: boolean): Promise<void> {
    return this.apply({ torch: enabled })
  }

  public zoom(level: number): Promise<void> {
    return this.apply({ zoom: level })
  }
}
