import type { CrossTabLockHandle } from '../../../core/coordination/lock/cross-tab-lock-handle.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import type { Store } from '../../../storage/store/store.ts'
import type { RecordingResult } from '../media-recording.ts'
import {
  KeptRecordingArchive,
  type KeptRecordingDescription,
  type KeptSegmentDescription,
} from './kept-recording-archive.ts'

/**
 * Writes one running recording into the storage, piece by piece, while its tab holds the lock of the recording.
 *
 * Every piece is an entry of its own, written when the recorder hands it over, and the description is written
 * again after it. So a page that is thrown away loses at most what the recorder had not handed over yet.
 */
export class RecordingKeeper {
  private isReleased = false

  /**
   * @param after what happens to the recording once `finish()` has read it back
   */
  public constructor(
    private readonly archive: KeptRecordingArchive,
    private readonly stores: {
      readonly descriptions: Store<KeptRecordingDescription>
      readonly pieces: Store<Uint8Array>
    },
    private readonly handle: CrossTabLockHandle,
    private readonly description: KeptRecordingDescription,
    private readonly after: 'remove' | 'keep',
    private readonly logger: Logger
  ) {}

  /**
   * The name of the recording in its namespace.
   */
  public get id(): string {
    return this.description.id
  }

  /**
   * Whether a piece was written, so there is something to find.
   */
  public get hasPieces(): boolean {
    return this.description.segments.some((segment) => segment.pieces > 0)
  }

  /**
   * Writes a piece the recorder handed over, then the description that counts it.
   *
   * @param duration the length of the segment so far, in milliseconds
   * @throws StorageQuotaExceededError if the storage is full; what was written before stays
   */
  public async write(segment: number, mimeType: string, bytes: Uint8Array, duration: number): Promise<void> {
    const kept = this.segmentOf(segment, mimeType)

    await this.stores.pieces.set(KeptRecordingArchive.pieceKey(this.id, segment, kept.pieces), bytes)

    kept.pieces++
    kept.bytes += bytes.byteLength
    kept.duration = duration
    kept.mimeType = mimeType
    this.description.mimeType = mimeType

    await this.stores.descriptions.set(this.id, this.description)
  }

  /**
   * Notes the length a segment ended with.
   */
  public async close(segment: number, mimeType: string, duration: number): Promise<void> {
    const kept = this.segmentOf(segment, mimeType)
    kept.duration = duration

    await this.stores.descriptions.set(this.id, this.description)
  }

  /**
   * Marks the recording as stopped, reads it back and, unless it is to be kept, removes it.
   *
   * @returns the recording, every segment with its `blob`
   */
  public async finish(): Promise<RecordingResult> {
    try {
      this.description.state = 'finished'
      await this.stores.descriptions.set(this.id, this.description)

      const result = await this.archive.read(this.stores, this.description)

      if (this.after === 'remove') {
        await this.archive.remove(this.stores, this.id)
      }

      return result
    } finally {
      await this.release()
    }
  }

  /**
   * Removes everything that was kept of the recording.
   */
  public async discard(): Promise<void> {
    try {
      await this.archive.remove(this.stores, this.id)
    } finally {
      await this.release()
    }
  }

  /**
   * Lets go of the recording without finishing it: what was written stays, and the recording is `interrupted` from
   * now on.
   */
  public async abandon(): Promise<void> {
    this.logger.warn(`The recording '${this.id}' stays interrupted in the storage`)
    await this.release()
  }

  private segmentOf(index: number, mimeType: string): KeptSegmentDescription {
    let segment = this.description.segments.find((kept) => kept.index === index)

    if (segment === undefined) {
      segment = { index, mimeType, pieces: 0, bytes: 0, duration: 0 }
      this.description.segments.push(segment)
    }

    return segment
  }

  private async release(): Promise<void> {
    if (!this.isReleased) {
      this.isReleased = true
      await this.handle.release()
    }
  }
}
