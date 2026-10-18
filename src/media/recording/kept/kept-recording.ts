import type { StorageRequirements } from '../../../storage/selection/storage-requirements.ts'
import type { RecordingResult } from '../media-recording.ts'

/**
 * Where a recording is kept while it runs, so a page that is thrown away loses at most the last piece.
 */
export interface RecordingKeepOptions {
  /** recordings of different namespaces never see each other */
  namespace: string
  /**
   * The name of the recording in its namespace. Default: a new one, which `recording.id` tells. A name that another
   * recording of the namespace has is replaced.
   */
  id?: string
  /**
   * What happens to the recording once it was stopped and `finished` has its result: `remove` it from the storage,
   * or `keep` it as `finished`. Default: `remove`.
   */
  after?: 'remove' | 'keep'
  /**
   * Which backend the recording is kept in. Default: one that keeps bytes as they are and lives with the origin,
   * where the browser has one.
   */
  storage?: StorageRequirements
}

/**
 * - `recording`: a tab records it right now
 * - `finished`: it was stopped and kept
 * - `interrupted`: no tab records it any more, and it was never stopped: the page was thrown away, closed or crashed
 *   while it recorded, or the storage was full
 */
export type KeptRecordingState = 'recording' | 'finished' | 'interrupted'

/**
 * A recording in the storage.
 */
export interface KeptRecording {
  readonly namespace: string
  readonly id: string
  /** when it was started, in milliseconds since 1970 */
  readonly startedAt: number
  /** what it was found to be when it was listed */
  readonly state: KeptRecordingState
  /** the format that was written */
  readonly mimeType: string
  /** in milliseconds, as far as it was kept */
  readonly duration: number
  /** as far as it was kept */
  readonly bytes: number
  /** how many files it has; see {@link RecordingResult.segments} */
  readonly segments: number

  /**
   * Puts the kept pieces together. A WebM file gets its length written into it, also one that was interrupted.
   *
   * @returns the recording, every segment with its `blob`
   */
  read(): Promise<RecordingResult>

  /**
   * Removes the recording from the storage.
   *
   * @throws MediaError if a tab records it right now
   */
  delete(): Promise<void>
}

/**
 * The recordings of one namespace (`butler.recorder.kept(namespace)`).
 */
export interface KeptRecordings {
  readonly namespace: string

  /**
   * Every recording of the namespace, the oldest first. On a page that was just loaded, the `interrupted` ones are
   * those the last visit could not finish.
   */
  list(): Promise<KeptRecording[]>

  /**
   * @returns `undefined` if there is no recording with the id
   */
  get(id: string): Promise<KeptRecording | undefined>
}
