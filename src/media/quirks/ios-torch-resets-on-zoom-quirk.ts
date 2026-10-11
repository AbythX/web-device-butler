import { PlatformQuirk, type ConstraintChange } from './platform-quirk.ts'

/**
 * On iOS the torch goes out when the zoom changes while it is still reported as on. The torch is therefore switched
 * off before the zoom changes and on again afterwards, also if the change failed.
 */
export class IosTorchResetsOnZoomQuirk extends PlatformQuirk {
  /**
   * How the quirk is named in the log.
   */
  public readonly name = 'ios-torch-resets-on-zoom'

  /** the changes during which the torch was switched off */
  private readonly interrupted = new WeakSet<ConstraintChange>()

  public override async beforeApply(change: ConstraintChange): Promise<void> {
    const changesZoom = change.change.advanced?.some((set) => set.zoom !== undefined) ?? false
    const isTorchOn = change.before.advanced?.some((set) => set.torch === true) ?? false

    if (changesZoom && isTorchOn) {
      this.interrupted.add(change)
      await change.apply({ advanced: [{ torch: false }] })
    }
  }

  public override async afterApply(change: ConstraintChange): Promise<void> {
    if (this.interrupted.delete(change)) {
      await change.apply({ advanced: [{ torch: true }] })
    }
  }
}
