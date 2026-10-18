import type { Listenable } from '../../core/events/listenable.ts'
import type { MediaSessionEnd, MediaSessionState } from '../session/media-session.ts'
import type { RecordingKeepOptions } from './kept/kept-recording.ts'

export interface RecordingSourceEvents {
  statechange: MediaSessionState
  ended: MediaSessionEnd
}

/**
 * What can be recorded: a camera session, a microphone session, or the session of both together.
 */
export interface RecordingSource extends Listenable<RecordingSourceEvents> {
  readonly stream: MediaStream
  readonly state: MediaSessionState
  allowTakeover: boolean
}

export interface RecordingOptions {
  /**
   * The format to write, as a MIME type such as `video/mp4` or `audio/webm;codecs=opus`, or several in the order
   * of preference; the first one the browser can write is used. Without it the library takes the first of the
   * common formats the browser can write, MP4 before WebM, because more players read it.
   */
  format?: string | readonly string[]
  audioBitsPerSecond?: number
  videoBitsPerSecond?: number
  /** how often the recorded data is handed over, in milliseconds; default: `1000` */
  interval?: number
  /**
   * Where the data is written instead of being kept in memory, for recordings that should not be held there:
   * `into: (segment) => store.writeStream(`memo-${segment}`)`. Called once per segment, see
   * {@link RecordingResult.segments}.
   *
   * A stream keeps nothing until it is closed, and the streams of the storage of the library replace their entry
   * only then: a page that is thrown away while it records loses what it wrote into them. For a recording that has
   * to survive the page, use {@link keep}.
   */
  into?: (segment: number) => Promise<WritableStream<Uint8Array>>
  /**
   * Keep the recording in the storage while it runs, piece by piece, instead of in memory. A page that is thrown
   * away loses at most the last `interval`; the next visit finds the recording as `interrupted` in
   * `butler.recorder.kept(namespace)`. Once it was stopped, `finished` reads it back, and it is removed from the
   * storage unless `after` says to keep it. Not together with {@link into}.
   */
  keep?: RecordingKeepOptions
  /** keep the screen on while the recording runs, where the browser can; default: `false` */
  keepAwake?: boolean
  /** refuse other tabs that ask for the device while the recording runs; default: `true` */
  holdDevice?: boolean
  /**
   * End the recording when the page is left: closed, reloaded or navigated away from. Default: `true`. What the
   * browser still lets the page do then is kept; see {@link MediaRecording}.
   */
  stopOnLeave?: boolean
}

/**
 * One file of a recording.
 */
export interface RecordedSegment {
  readonly index: number
  /** what the browser wrote, which a player has to be told */
  readonly mimeType: string
  readonly bytes: number
  /** in milliseconds, without the time the recording was paused */
  readonly duration: number
  /**
   * The data of the segment; `undefined` if it was written somewhere else through `into`. A WebM file has its
   * length written into it, which the recorder of a browser leaves out, so a player can show it and jump to a
   * position; `WebmDuration` does the same for a file that was written somewhere else.
   */
  readonly blob?: Blob
}

export interface RecordingResult {
  readonly mimeType: string
  /** in milliseconds, without the time the recording was paused */
  readonly duration: number
  readonly bytes: number
  /**
   * The files of the recording, in order. There is one, unless the device was started again or replaced by another
   * one while the recording ran: a browser cannot continue a file with another track, so the recording continues in
   * a new file that plays on its own.
   */
  readonly segments: readonly RecordedSegment[]
  /** the recording, if it was kept in memory and is one segment */
  readonly blob?: Blob
}

export interface RecordingProgress {
  /** in milliseconds, without the time the recording was paused */
  readonly duration: number
  readonly bytes: number
  /** how many segments the recording has by now */
  readonly segments: number
}

/**
 * - `recording`: data is written, or will be as soon as the device delivers again
 * - `paused`: the application paused the recording
 * - `stopped`: the recording is over
 */
export type MediaRecordingState = 'recording' | 'paused' | 'stopped'

export interface MediaRecordingEvents {
  statechange: MediaRecordingState
  /** data was handed over */
  progress: RecordingProgress
}

/**
 * One recording that runs. It is started with `butler.recorder.record()` and ends with {@link stop}, or by itself
 * when its session ends or the page is left.
 *
 * A page that goes to the background can be thrown away without another word. So whenever the page is hidden or
 * frozen, the recording has the browser hand over what it recorded so far: with `into`, that much is written by
 * then, and what a stream that was never closed keeps of it is up to where it writes.
 */
export interface MediaRecording extends Listenable<MediaRecordingEvents>, AsyncDisposable {
  readonly state: MediaRecordingState

  /** the name the recording is kept under in its namespace; `undefined` unless it is kept */
  readonly id: string | undefined

  /** the format that is written */
  readonly mimeType: string

  /** how long was recorded so far, in milliseconds, without the time the recording was paused */
  readonly duration: number

  /** how much was handed over so far */
  readonly bytes: number

  /**
   * Resolves when the recording is over, however it ended. It rejects if the recording could not be written to its
   * end; nothing is kept of the segment that failed then.
   */
  readonly finished: Promise<RecordingResult>

  /**
   * Stops writing until {@link resume}. The device keeps running.
   */
  pause(): void

  resume(): void

  /**
   * Ends the recording and keeps it. Stopping a recording that is over returns its result again.
   *
   * @returns what {@link finished} resolves with
   */
  stop(): Promise<RecordingResult>

  /**
   * Ends the recording without keeping the segment that is being written: its data is dropped, and a stream it was
   * written into is aborted. Segments that were finished before stay where they are, except for a recording that is
   * kept in the storage: that one is removed as a whole.
   */
  discard(): Promise<void>
}
