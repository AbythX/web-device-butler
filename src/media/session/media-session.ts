import type { Listenable } from '../../core/events/listenable.ts'

/**
 * - `live`: the device delivers
 * - `muted`: nothing is delivered right now: the browser or the system paused the device, for example while the
 *   page is in the background, or the session is starting its device again or switching to another one
 * - `ended`: the session is over, for the reason its `ended` event names
 */
export type MediaSessionState = 'live' | 'muted' | 'ended'

/**
 * - `closed`: the application closed the session
 * - `taken-over`: another tab asked for the device and got it
 * - `device`: the device went away, or the browser or the user stopped it
 */
export type MediaSessionEndReason = 'closed' | 'taken-over' | 'device'

export interface MediaSessionEnd {
  readonly reason: MediaSessionEndReason
}

export interface MediaSessionEvents {
  statechange: MediaSessionState
  /** the session continues with a new track, after its device was started again or replaced by another one */
  trackchange: MediaStreamTrack
  /** emitted once, when the device is free for others again */
  ended: MediaSessionEnd
}

/**
 * One running stream of one device. A session is created by its manager, never by the application, and holds the
 * device until it is closed.
 */
export interface MediaSession<Events extends MediaSessionEvents = MediaSessionEvents>
  extends Listenable<Events>, AsyncDisposable {
  /**
   * For `<video>.srcObject`, `MediaRecorder` or WebRTC.
   */
  readonly stream: MediaStream

  /**
   * The track of the device. It is replaced when the device is switched or started again.
   */
  readonly track: MediaStreamTrack

  /**
   * What the session does right now.
   */
  readonly state: MediaSessionState

  /**
   * Stops the device and releases it for other sessions and other tabs. Closing a session that has ended does
   * nothing.
   */
  close(): Promise<void>

  /**
   * Whether another tab may take the device away with `whenBusy: 'takeover'`. An application sets it to `false`
   * while it must not be interrupted, for example while it records.
   */
  allowTakeover: boolean
}
