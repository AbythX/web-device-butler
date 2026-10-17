import type { CrossTabLock } from '../../../core/coordination/lock/cross-tab-lock.ts'
import type { CrossTabLockHandle } from '../../../core/coordination/lock/cross-tab-lock-handle.ts'
import type { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import { BinaryCodec } from '../../../storage/codecs/binary-codec.ts'
import type { StorageRequirements } from '../../../storage/selection/storage-requirements.ts'
import type { StorageManager } from '../../../storage/storage-manager.ts'
import type { Store } from '../../../storage/store/store.ts'
import { MediaError } from '../../errors/media-error.ts'
import type { RecordedSegment, RecordingResult } from '../media-recording.ts'
import { RecordingFile } from '../recording-file.ts'
import type { KeptRecording, KeptRecordingState } from './kept-recording.ts'

/**
 * What is kept about one segment of a recording, next to its pieces.
 */
export interface KeptSegmentDescription {
  readonly index: number
  mimeType: string
  /** how many pieces were written */
  pieces: number
  bytes: number
  /** in milliseconds, up to the last piece that was written */
  duration: number
}

/**
 * What is kept about a recording, next to its pieces. It is written again with every piece.
 */
export interface KeptRecordingDescription {
  /** the version of this shape, so a later one can tell an older entry */
  readonly version: 1
  readonly id: string
  readonly startedAt: number
  mimeType: string
  /** `recording` until it was stopped; whether it still runs, the lock says */
  state: 'recording' | 'finished'
  readonly segments: KeptSegmentDescription[]
}

/**
 * The two stores of a namespace: the descriptions as JSON, the pieces as bytes, in the same backend.
 */
interface ArchiveStores {
  readonly descriptions: Store<KeptRecordingDescription>
  readonly pieces: Store<Uint8Array>
}

/**
 * Keeps recordings in the storage, piece by piece, and reads them back. One archive serves every namespace.
 */
export class KeptRecordingArchive {
  /** where the browser has a backend that keeps bytes as they are and lives with the origin, that one */
  private static readonly defaultStorage: StorageRequirements = { prefer: { persistence: 'origin', binary: true } }

  private readonly stores = new Map<string, Promise<ArchiveStores>>()

  public constructor(
    private readonly storage: () => StorageManager,
    private readonly lock: CrossTabLock,
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {}

  /**
   * The name of the lock a tab holds while it records the recording.
   */
  public static lockName(namespace: string, id: string): string {
    return `web-device-butler:recording:${namespace}:${id}`
  }

  /**
   * The key of one piece. The numbers are padded, so the keys sort in the order the pieces were written.
   */
  public static pieceKey(id: string, segment: number, piece: number): string {
    return `${id}/${String(segment).padStart(4, '0')}/${String(piece).padStart(6, '0')}`
  }

  /**
   * Takes the lock of a recording and writes its first description.
   *
   * @throws MediaError if another tab records a recording with the same id right now
   */
  public async begin(
    namespace: string,
    id: string,
    storage: StorageRequirements | undefined
  ): Promise<{ stores: ArchiveStores; handle: CrossTabLockHandle; description: KeptRecordingDescription }> {
    const stores = await this.storesOf(namespace, storage)
    const handle = await this.lock.tryAcquire(KeptRecordingArchive.lockName(namespace, id))

    if (handle === undefined) {
      throw new MediaError(`The recording '${id}' of '${namespace}' is being recorded right now`)
    }

    try {
      // a recording with the same id is replaced
      await this.remove(stores, id)

      const description: KeptRecordingDescription = {
        version: 1,
        id,
        startedAt: Date.now(),
        mimeType: '',
        state: 'recording',
        segments: [],
      }

      await stores.descriptions.set(id, description)

      return { stores, handle, description }
    } catch (error) {
      await handle.release()
      throw error
    }
  }

  /**
   * Every recording of the namespace, the oldest first.
   */
  public async list(namespace: string, storage?: StorageRequirements): Promise<KeptRecording[]> {
    const stores = await this.storesOf(namespace, storage)
    const recordings: KeptRecording[] = []

    for await (const [, description] of stores.descriptions.entries()) {
      recordings.push(await this.recordingOf(namespace, stores, description))
    }

    return recordings.sort((first, second) => first.startedAt - second.startedAt)
  }

  public async get(namespace: string, id: string, storage?: StorageRequirements): Promise<KeptRecording | undefined> {
    const stores = await this.storesOf(namespace, storage)
    const description = await stores.descriptions.get(id)

    return description === undefined ? undefined : this.recordingOf(namespace, stores, description)
  }

  /**
   * Puts the pieces of every segment together. A piece that was written after the last description, because the
   * page was thrown away in between, is read as well.
   */
  public async read(stores: ArchiveStores, description: KeptRecordingDescription): Promise<RecordingResult> {
    const segments: RecordedSegment[] = []

    for (const segment of description.segments) {
      const parts: Uint8Array<ArrayBuffer>[] = []

      for (let piece = 0; ; piece++) {
        const bytes = await stores.pieces.get(KeptRecordingArchive.pieceKey(description.id, segment.index, piece))

        if (bytes === undefined) {
          break
        }

        // SAFETY: the binary codec hands out bytes with a buffer of their own, never a shared one
        parts.push(bytes as Uint8Array<ArrayBuffer>)
      }

      const bytes = parts.reduce((sum, part) => sum + part.byteLength, 0)

      if (bytes > 0) {
        const { index, mimeType, duration } = segment
        const blob = await RecordingFile.of(parts, mimeType, duration, this.environment, this.logger)

        segments.push({ index, mimeType, bytes, duration, blob })
      }
    }

    return {
      mimeType: description.mimeType,
      duration: segments.reduce((sum, segment) => sum + segment.duration, 0),
      bytes: segments.reduce((sum, segment) => sum + segment.bytes, 0),
      segments,
      blob: segments.length === 1 ? segments[0]?.blob : undefined,
    }
  }

  /**
   * Deletes the description and every piece of a recording.
   */
  public async remove(stores: ArchiveStores, id: string): Promise<void> {
    const prefix = `${id}/`

    for await (const key of stores.pieces.keys()) {
      if (key.startsWith(prefix)) {
        await stores.pieces.delete(key)
      }
    }

    await stores.descriptions.delete(id)
  }

  private async recordingOf(
    namespace: string,
    stores: ArchiveStores,
    description: KeptRecordingDescription
  ): Promise<KeptRecording> {
    const lockName = KeptRecordingArchive.lockName(namespace, description.id)
    let state: KeptRecordingState = 'finished'

    if (description.state === 'recording') {
      state = (await this.lock.isHeld(lockName)) ? 'recording' : 'interrupted'
    }

    const { id, startedAt, mimeType, segments } = description

    return {
      namespace,
      id,
      startedAt,
      state,
      mimeType,
      duration: segments.reduce((sum, segment) => sum + segment.duration, 0),
      bytes: segments.reduce((sum, segment) => sum + segment.bytes, 0),
      segments: segments.filter((segment) => segment.bytes > 0).length,
      read: async () => this.read(stores, (await stores.descriptions.get(id)) ?? description),
      delete: async () => {
        const handle = await this.lock.tryAcquire(lockName)

        if (handle === undefined) {
          throw new MediaError(`The recording '${id}' of '${namespace}' is being recorded right now`)
        }

        try {
          await this.remove(stores, id)
        } finally {
          await handle.release()
        }
      },
    }
  }

  /**
   * Opened once per namespace. The pieces go into the backend the descriptions were given, so both live as long.
   */
  private storesOf(namespace: string, storage: StorageRequirements | undefined): Promise<ArchiveStores> {
    if (namespace.length === 0) {
      throw new TypeError('Kept recordings need a namespace')
    }

    let stores = this.stores.get(namespace)

    if (stores === undefined) {
      stores = this.open(namespace, storage)
      this.stores.set(namespace, stores)
      // a namespace that could not be opened is tried again on the next call
      stores.catch(() => this.stores.delete(namespace))
    }

    return stores
  }

  private async open(namespace: string, storage: StorageRequirements | undefined): Promise<ArchiveStores> {
    const manager = this.storage()

    const descriptions = await manager.open<KeptRecordingDescription>({
      namespace: `recordings-${namespace}`,
      ...KeptRecordingArchive.defaultStorage,
      ...storage,
    })

    const pieces = await manager.open<Uint8Array>({
      namespace: `recordings-${namespace}-pieces`,
      driver: descriptions.capabilities.driver,
      codec: new BinaryCodec(),
    })

    return { descriptions, pieces }
  }
}
