import type { ScreenWakeLock } from '../../../screen/wake-lock/screen-wake-lock.ts'
import type { WakeLockHold } from '../../../screen/wake-lock/wake-lock-hold.ts'
import { StateController } from '../state-controller.ts'

export interface WakeLockSnapshot {
  /** whether this component asked for the screen to stay on */
  readonly isRequested: boolean
  /** why the last request failed; cleared by the next one */
  readonly error: unknown
}

/**
 * One hold of the wake lock for one component, so it does not let the screen sleep while another part of the
 * application still needs it awake. The hold is released when the component goes away. Shared by `useWakeLock` of
 * both adapters.
 */
export class WakeLockController extends StateController<WakeLockSnapshot> {
  private hold: WakeLockHold | undefined
  private isWanted = false

  /**
   * @param wakeLock a getter, so a component can hand over another one
   */
  public constructor(private readonly wakeLock: () => ScreenWakeLock) {
    super({ isRequested: false, error: undefined })
  }

  /**
   * Keeps the screen on until {@link release} or until the component goes away.
   */
  public readonly request = async (): Promise<void> => {
    if (this.isWanted) {
      return
    }

    this.isWanted = true
    this.change({ error: undefined })

    try {
      const requested = await this.wakeLock().request()

      // released, or gone away, while the browser was asked
      if (this.isWanted) {
        this.hold = requested
        this.change({ isRequested: true })
      } else {
        requested.release()
      }
    } catch (failure) {
      this.isWanted = false
      this.change({ error: failure })
    }
  }

  public readonly release = (): void => {
    this.isWanted = false
    this.hold?.release()
    this.hold = undefined
    this.change({ isRequested: false })
  }

  protected override onDeactivate(): void {
    this.release()
  }
}
