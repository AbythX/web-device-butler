import type { ConstraintQueue } from './constraint-queue.ts'
import type { TrackCapabilities, TrackConstraints, TrackConstraintSet, TrackSettings } from './track-constraints.ts'

/**
 * The base of the objects that control one feature of a running device (torch, zoom, ...). A session only creates
 * the control of a feature its device has, so a control that exists works.
 *
 * A control keeps no state of its own. What it reports is read from the track, so it cannot drift from the hardware.
 */
export abstract class TrackControl {
  public constructor(private readonly queue: ConstraintQueue) {}

  protected get settings(): TrackSettings {
    return this.queue.settings
  }

  protected get capabilities(): TrackCapabilities {
    return this.queue.capabilities
  }

  /**
   * The current value of a hardware setting. Browsers that do not report it among the settings of the track are asked
   * what the track was constrained to instead.
   */
  protected read(name: string): unknown {
    const settings = this.settings

    return name in settings ? settings[name] : this.queue.constraints.advanced?.[0]?.[name]
  }

  /**
   * Changes what the track is asked to deliver, such as its resolution or the processing of its sound, through the
   * queue of the session.
   */
  protected constrain(change: TrackConstraints): Promise<void> {
    return this.queue.apply(change)
  }

  /**
   * Changes the hardware through the queue of the session, so it cannot overlap with a change of another control.
   */
  protected apply(change: TrackConstraintSet): Promise<void> {
    return this.queue.apply({ advanced: [change] })
  }
}
