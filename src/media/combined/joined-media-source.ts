import type { Listenable } from '../../core/events/listenable.ts'
import type { MediaSession, MediaSessionEnd, MediaSessionState } from '../session/media-session.ts'

export interface JoinedMediaSourceEnd extends MediaSessionEnd {
  /** the session that ended first; not set if the joined source was disposed */
  readonly source?: MediaSession
}

export interface JoinedMediaSourceEvents {
  statechange: MediaSessionState
  /** emitted once, when the first of the sessions has ended or the source was disposed */
  ended: JoinedMediaSourceEnd
}

/**
 * The tracks of several sessions in one stream, to record them together: a capture of the screen with the voice of
 * the user, for example. It is what `butler.media.join()` returns, and it can be passed to `butler.recorder.record()`.
 *
 * The source does not own its sessions. It ends when the first of them ends, and leaves the others running; the
 * application closes them, as it opened them.
 */
export interface JoinedMediaSource extends Listenable<JoinedMediaSourceEvents>, Disposable {
  /** the sessions, in the order they were joined */
  readonly sources: readonly MediaSession[]

  /**
   * The tracks of every session in one stream, for `<video>.srcObject` or `MediaRecorder`. It stays the same object
   * when a session continues with a new track.
   */
  readonly stream: MediaStream

  /**
   * `live` while every session delivers, `muted` while one of them does not, `ended` once one has ended.
   */
  readonly state: MediaSessionState

  /**
   * Whether another tab may take a device of the sessions away. Setting it sets it on every session.
   */
  allowTakeover: boolean

  /**
   * Stops following the sessions and ends the source with `closed`. The sessions keep running.
   */
  dispose(): void
}
