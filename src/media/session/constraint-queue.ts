import type { Logger } from '../../core/logging/logger.ts'
import { MediaErrorFactory } from '../errors/media-error-factory.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { ConstraintChange, PlatformQuirk } from '../quirks/platform-quirk.ts'
import { PlatformQuirks } from '../quirks/platform-quirks.ts'
import type { MediaSourceKind } from './media-source-kind.ts'
import type { TrackCapabilities, TrackConstraints, TrackSettings } from './track-constraints.ts'

/**
 * Every change of the constraints of a session goes through its queue, one after another. Some platforms cannot
 * handle overlapping changes, and without the queue a torch and a zoom call at the same time would overwrite each
 * other.
 */
export class ConstraintQueue {
  private pending: Promise<void> = Promise.resolve()
  private isClosed = false

  public constructor(
    private currentTrack: MediaStreamTrack,
    private readonly kind: MediaSourceKind,
    private readonly quirks: readonly PlatformQuirk[],
    private readonly logger: Logger
  ) {}

  /**
   * The track the changes are applied to.
   */
  public get track(): MediaStreamTrack {
    return this.currentTrack
  }

  /**
   * What the hardware does right now, read from the track on every access.
   */
  public get settings(): TrackSettings {
    // SAFETY: TrackSettings is what the browser returns plus an index for settings the DOM types do not know
    return this.currentTrack.getSettings() as TrackSettings
  }

  /**
   * What the track is constrained to. The hardware constraints live in the first advanced set.
   */
  public get constraints(): TrackConstraints {
    return this.constraintsOf(this.currentTrack)
  }

  /**
   * What the track can do, corrected by the quirks of the platform. Empty where the browser cannot tell.
   */
  public get capabilities(): TrackCapabilities {
    return PlatformQuirks.capabilitiesOf(this.currentTrack, this.quirks)
  }

  /**
   * Adds the change to what the track is constrained to already. It is applied once every earlier change has
   * settled; a failed change does not hold up the following ones.
   *
   * @throws SessionClosedError if the session was closed before the change was applied
   */
  public apply(change: TrackConstraints): Promise<void> {
    const applied = this.pending.then(() => this.applyInOrder(change))
    this.pending = applied.catch(() => undefined)

    return applied
  }

  /**
   * Changes that follow are applied to the new track.
   */
  public attach(track: MediaStreamTrack): void {
    this.currentTrack = track
  }

  /**
   * Changes that are still waiting fail.
   */
  public close(): void {
    this.isClosed = true
  }

  private async applyInOrder(change: TrackConstraints): Promise<void> {
    if (this.isClosed) {
      throw new SessionClosedError()
    }

    const track = this.currentTrack

    const context: ConstraintChange = {
      track,
      change,
      before: this.constraintsOf(track),
      apply: (direct) => this.applyTo(track, direct),
    }

    for (const quirk of this.quirks) {
      await quirk.beforeApply(context)
    }

    try {
      await this.applyTo(track, change)
    } finally {
      for (let index = this.quirks.length - 1; index >= 0; index--) {
        await this.quirks[index]?.afterApply(context)
      }
    }
  }

  private async applyTo(track: MediaStreamTrack, change: TrackConstraints): Promise<void> {
    const constraints = this.merge(this.constraintsOf(track), change)
    this.logger.debug('Applying constraints', constraints)

    try {
      // SAFETY: TrackConstraints only adds the hardware settings the DOM types do not know yet; the browser takes them
      await track.applyConstraints(constraints as MediaTrackConstraints)
    } catch (error) {
      throw MediaErrorFactory.from(error, `Could not change the ${this.kind}`, this.kind)
    }
  }

  /**
   * The types of the browser do not know the constraints of the camera hardware.
   */
  private constraintsOf(track: MediaStreamTrack): TrackConstraints {
    // SAFETY: TrackConstraints is what the browser returns plus an index for settings the DOM types do not know
    return track.getConstraints() as TrackConstraints
  }

  /**
   * `applyConstraints` replaces all constraints of the track, so the change is merged into the current ones. The
   * hardware constraints live in the first advanced set, which is merged as well.
   */
  private merge(current: TrackConstraints, change: TrackConstraints): TrackConstraints {
    const merged: TrackConstraints = { ...current, ...change }

    if (current.advanced !== undefined && change.advanced !== undefined) {
      const [currentSet, ...currentRest] = current.advanced
      const [changedSet, ...changedRest] = change.advanced
      merged.advanced = [{ ...currentSet, ...changedSet }, ...(changedRest.length > 0 ? changedRest : currentRest)]
    }

    return merged
  }
}
