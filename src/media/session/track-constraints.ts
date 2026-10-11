/**
 * One set of constraints. The types of the browser do not know the constraints of the camera hardware (`torch`,
 * `zoom`, `focusMode`, ...), so any name is allowed.
 */
export type TrackConstraintSet = MediaTrackConstraintSet & { [name: string]: unknown }

/**
 * The constraints of a track, as `applyConstraints` takes them.
 */
export interface TrackConstraints extends MediaTrackConstraintSet {
  advanced?: TrackConstraintSet[]
}

export type TrackCapabilities = MediaTrackCapabilities & { [name: string]: unknown }

export type TrackSettings = MediaTrackSettings & { [name: string]: unknown }
