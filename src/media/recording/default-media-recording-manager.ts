import { CrossTabLock } from '../../core/coordination/lock/cross-tab-lock.ts'
import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { ScopedLogger } from '../../core/logging/scoped-logger.ts'
import { DefaultPageLifecycle } from '../../platform/page/default-page-lifecycle.ts'
import type { PageLifecycle } from '../../platform/page/page-lifecycle.ts'
import { DefaultScreenWakeLock } from '../../screen/wake-lock/default-screen-wake-lock.ts'
import type { ScreenWakeLock } from '../../screen/wake-lock/screen-wake-lock.ts'
import type { WakeLockHold } from '../../screen/wake-lock/wake-lock-hold.ts'
import { DefaultStorageManager } from '../../storage/default-storage-manager.ts'
import type { StorageRequirements } from '../../storage/selection/storage-requirements.ts'
import type { StorageManager } from '../../storage/storage-manager.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import { DefaultMediaRecording } from './default-media-recording.ts'
import type { KeptRecordings, RecordingKeepOptions } from './kept/kept-recording.ts'
import { KeptRecordingArchive } from './kept/kept-recording-archive.ts'
import { RecordingKeeper } from './kept/recording-keeper.ts'
import type { MediaRecording, RecordingOptions, RecordingSource } from './media-recording.ts'
import type { MediaRecordingManager } from './media-recording-manager.ts'
import { RecordingSupport } from './recording-support.ts'

/**
 * The implementation of {@link MediaRecordingManager}.
 */
export class DefaultMediaRecordingManager implements MediaRecordingManager {
  /**
   * MP4 first: more players read it, and the browsers that cannot write it say so. The formats name no codecs: a
   * browser that is told to write sound into a recording of a camera alone can wait for that sound forever, and
   * each browser knows best which of its codecs fits.
   */
  private static readonly commonFormats: Record<'audio' | 'video', readonly string[]> = {
    video: ['video/mp4', 'video/webm'],
    audio: ['audio/mp4', 'audio/webm', 'audio/ogg'],
  }

  /**
   * For applications that only use the recorder. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): MediaRecordingManager {
    return new DefaultMediaRecordingManager(
      environment,
      new DefaultScreenWakeLock(environment, logger),
      new DefaultPageLifecycle(environment, logger),
      logger
    )
  }

  private readonly archive: KeptRecordingArchive
  /** created on the first kept recording, where no storage was given */
  private ownStorage: StorageManager | undefined

  /**
   * @param wakeLock keeps the screen on for the recordings that ask for it
   * @param page tells the recordings when the page goes to the background or is left
   * @param storage keeps the recordings that ask for it; default: a storage of its own, created when it is needed
   * @param lock tells the tabs which kept recordings run
   */
  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly wakeLock: ScreenWakeLock,
    private readonly page: PageLifecycle,
    private readonly logger: Logger,
    storage?: StorageManager,
    lock: CrossTabLock = CrossTabLock.create(environment, logger)
  ) {
    this.archive = new KeptRecordingArchive(
      () => storage ?? (this.ownStorage ??= DefaultStorageManager.create({}, environment, logger)),
      lock,
      environment,
      new ScopedLogger('KeptRecordings', logger)
    )
  }

  public get isSupported(): boolean {
    return RecordingSupport.isSupportedIn(this.environment)
  }

  public formats(
    kind: 'audio' | 'video',
    candidates: readonly string[] = DefaultMediaRecordingManager.commonFormats[kind]
  ): string[] {
    return candidates.filter((format) => this.canRecord(format))
  }

  public canRecord(format: string): boolean {
    const MediaRecorder = RecordingSupport.resolveFor(this.environment)

    return MediaRecorder !== undefined && typeof MediaRecorder.isTypeSupported === 'function'
      ? MediaRecorder.isTypeSupported(format)
      : false
  }

  public async record(source: RecordingSource, options: RecordingOptions = {}): Promise<MediaRecording> {
    const MediaRecorder = RecordingSupport.resolveFor(this.environment)

    if (MediaRecorder === undefined) {
      throw new UnsupportedError('MediaRecorder')
    }

    if (source.state === 'ended') {
      throw new SessionClosedError()
    }

    if (options.keep !== undefined && options.into !== undefined) {
      throw new TypeError('A recording is either written into a stream or kept in the storage, not both')
    }

    const format = this.formatFor(source, options)
    const keeper = options.keep === undefined ? undefined : await this.keeperFor(options.keep)
    const hold = options.keepAwake ? await this.keepAwake() : undefined

    const recording = new DefaultMediaRecording(
      source,
      MediaRecorder,
      format,
      options,
      this.environment,
      hold,
      this.page,
      new ScopedLogger('MediaRecording', this.logger),
      keeper
    )

    await recording.start()

    return recording
  }

  public kept(namespace: string, storage?: StorageRequirements): KeptRecordings {
    return {
      namespace,
      list: () => this.archive.list(namespace, storage),
      get: (id) => this.archive.get(namespace, id, storage),
    }
  }

  private async keeperFor(options: RecordingKeepOptions): Promise<RecordingKeeper> {
    const id = options.id ?? DefaultMediaRecordingManager.newId()
    const { stores, handle, description } = await this.archive.begin(options.namespace, id, options.storage)

    return new RecordingKeeper(
      this.archive,
      stores,
      handle,
      description,
      options.after ?? 'remove',
      new ScopedLogger(`KeptRecording(${options.namespace})`, this.logger)
    )
  }

  /**
   * Sorts after the ids that were made before it, and does not collide with one another tab makes at the same time.
   */
  private static newId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }

  /**
   * @returns `undefined` where the browser cannot be asked what it writes; it chooses itself then
   * @throws UnsupportedError if the browser can write none of the formats the application asked for
   */
  private formatFor(source: RecordingSource, { format }: RecordingOptions): string | undefined {
    const kind = source.stream.getVideoTracks().length > 0 ? 'video' : 'audio'

    if (format === undefined) {
      return this.formats(kind)[0]
    }

    const wanted = typeof format === 'string' ? [format] : format
    const [supported] = this.formats(kind, wanted)

    if (supported === undefined) {
      throw new UnsupportedError(`MediaRecorder (${wanted.join(', ')})`)
    }

    return supported
  }

  /**
   * A screen that cannot be kept on is no reason not to record.
   */
  private async keepAwake(): Promise<WakeLockHold | undefined> {
    if (!this.wakeLock.isSupported) {
      return undefined
    }

    try {
      return await this.wakeLock.request()
    } catch (error) {
      this.logger.info('Could not keep the screen on for the recording', error)

      return undefined
    }
  }
}
