import type {
  MediaRecording,
  MediaRecordingState,
  RecordingOptions,
  RecordingResult,
  RecordingSource,
} from '../../../media/recording/media-recording.ts'
import type { MediaRecordingManager } from '../../../media/recording/media-recording-manager.ts'
import { StateController } from '../state-controller.ts'

export interface RecordingSnapshot {
  /** the recording that runs; `undefined` before `start()` and once it is over */
  readonly recording: MediaRecording | undefined
  /** `undefined` while there is no recording */
  readonly state: MediaRecordingState | undefined
  /** how long was recorded, in milliseconds; follows each time the recorder hands over data */
  readonly duration: number
  /** how much was handed over */
  readonly bytes: number
  /** what the last recording left; cleared by the next `start()` */
  readonly result: RecordingResult | undefined
  /** why the last recording could not be started or written; cleared by the next `start()` */
  readonly error: unknown
}

/**
 * One recording at a time. A recording that ends by itself, because its session ended, leaves its result the same
 * way as one that is stopped. Shared by `useRecording` of both adapters.
 */
export class RecordingController extends StateController<RecordingSnapshot> {
  /**
   * @param recorder the manager that starts the next recording; a getter, so a component can hand over another one
   */
  public constructor(private readonly recorder: () => MediaRecordingManager) {
    super({ recording: undefined, state: undefined, duration: 0, bytes: 0, result: undefined, error: undefined })
  }

  /**
   * Starts a recording, after stopping the one that runs. A failure is not thrown, it ends up in `error`.
   *
   * @returns the recording, or `undefined` if it could not be started
   */
  public readonly start = async (
    source: RecordingSource,
    options?: RecordingOptions
  ): Promise<MediaRecording | undefined> => {
    await this.stop()
    this.change({ result: undefined, error: undefined, duration: 0, bytes: 0 })

    try {
      const started = await this.recorder().record(source, options)

      // the component may have gone away while the recording was starting
      if (!this.isActive) {
        await started.stop().catch(() => undefined)

        return undefined
      }

      started.on('statechange', (state) => {
        if (this.read().recording === started && state !== 'stopped') {
          this.change({ state })
        }
      })
      started.on('progress', ({ duration, bytes }) => {
        if (this.read().recording === started) {
          this.change({ duration, bytes })
        }
      })

      this.change({ recording: started, state: started.state })
      void this.follow(started)

      return started
    } catch (failure) {
      this.change({ error: failure })

      return undefined
    }
  }

  /**
   * Stops the recording that runs.
   *
   * @returns what it left, which is also in `result`; `undefined` if nothing ran or it could not be written
   */
  public readonly stop = async (): Promise<RecordingResult | undefined> => {
    const running = this.read().recording

    if (running === undefined) {
      return undefined
    }

    running.stop().catch(() => undefined)

    return this.follow(running)
  }

  public readonly pause = (): void => this.read().recording?.pause()

  public readonly resume = (): void => this.read().recording?.resume()

  protected override onDeactivate(): void {
    void this.stop()
  }

  /**
   * What a recording leaves, as a result or as an error, for the one that is current.
   */
  private follow(started: MediaRecording): Promise<RecordingResult | undefined> {
    return started.finished.then(
      (finished) => {
        if (this.read().recording === started) {
          this.change({
            recording: undefined,
            state: undefined,
            duration: finished.duration,
            bytes: finished.bytes,
            result: finished,
          })
        }

        return finished
      },
      (failure: unknown) => {
        if (this.read().recording === started) {
          this.change({ recording: undefined, state: undefined, error: failure })
        }

        return undefined
      }
    )
  }
}
