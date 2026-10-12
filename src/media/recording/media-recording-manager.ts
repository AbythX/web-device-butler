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
   * @throws MediaError if the browser does not start the recording
   */
  record(source: RecordingSource, options?: RecordingOptions): Promise<MediaRecording>
}
