import type { TrackCapabilities, TrackConstraints } from '../session/track-constraints.ts'

/**
 * One change of the constraints of a track, as a quirk sees it.
 */
export interface ConstraintChange {
  readonly track: MediaStreamTrack
  /** what is being changed */
  readonly change: TrackConstraints
  /** the constraints of the track before the change */
  readonly before: TrackConstraints
  /**
   * Changes the track directly. The quirk runs inside the queue of the session, so this cannot overlap with another
   * change.
   */
  apply(change: TrackConstraints): Promise<void>
}

/**
 * A workaround for the behaviour of one platform. A session is composed with the quirks of the platform it runs on,
 * so a new workaround is a new class and the session stays the same for every platform.
 */
export abstract class PlatformQuirk {
  /** for the log */
  public abstract readonly name: string

  /**
   * Runs before a change is applied to the track.
   */
  public beforeApply(_change: ConstraintChange): void | Promise<void> {}

  /**
   * Runs after a change was applied, also if applying it failed.
   */
  public afterApply(_change: ConstraintChange): void | Promise<void> {}

  /**
   * Corrects what the track reports about itself.
   */
  public readCapabilities(_track: MediaStreamTrack, capabilities: TrackCapabilities): TrackCapabilities {
    return capabilities
  }
}
