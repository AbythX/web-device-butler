import type { StorageRequirements } from '../../storage/selection/storage-requirements.ts'
import type { KeptRecordings } from './kept/kept-recording.ts'
import type { MediaRecording, RecordingOptions, RecordingSource } from './media-recording.ts'

/**
 * Records what a session delivers (`butler.recorder`): chooses a format the browser can write, keeps the recording
 * going when its device is started again, and writes it into memory or wherever the application says.
 */
export interface MediaRecordingManager {
  /**
   * `false` where the browser cannot record.
   */
  readonly isSupported: boolean

  /**
   * The formats the browser can write, best first.
   *
   * @param kind what is recorded: sound only, or a picture with or without sound
   * @param candidates the formats to choose from; default: the common ones, MP4 before WebM
   */
  formats(kind: 'audio' | 'video', candidates?: readonly string[]): string[]

  /**
   * Whether the browser can write this format.
   */
  canRecord(format: string): boolean

  /**
   * Starts to record what the session delivers.
   *
   * @throws UnsupportedError where the browser cannot record, or none of the formats that were asked for
   * @throws SessionClosedError if the session has ended
   * @throws MediaError if the browser does not start the recording, or another tab records a kept recording with
   *   the same id
   * @throws StorageError if a recording that is to be kept cannot be written into the storage
   * @throws TypeError if the options ask for both `into` and `keep`
   */
  record(source: RecordingSource, options?: RecordingOptions): Promise<MediaRecording>

  /**
   * The recordings that were kept in the storage under a namespace (`keep: { namespace }`): those that were stopped
   * and kept, those that run right now, and those a page could not finish.
   *
   * @param storage which backend they are kept in; it has to name the same as `keep.storage` did, and is only read
   *   the first time a namespace is used on the page
   */
  kept(namespace: string, storage?: StorageRequirements): KeptRecordings
}
