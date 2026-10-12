import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'

import type {
  MediaRecording,
  MediaRecordingState,
  RecordingOptions,
  RecordingResult,
  RecordingSource,
} from '../../../media/recording/media-recording.ts'
import type { MediaRecordingManager } from '../../../media/recording/media-recording-manager.ts'

export interface UseRecording {
  /** the recording that runs; `undefined` before `start()` and once it is over */
  readonly recording: ShallowRef<MediaRecording | undefined>
  /** `undefined` while there is no recording */
  readonly state: Ref<MediaRecordingState | undefined>
  /** how long was recorded, in milliseconds; follows each time the recorder hands over data */
  readonly duration: Ref<number>
  /** how much was handed over */
  readonly bytes: Ref<number>
  /** what the last recording left; cleared by the next `start()` */
  readonly result: ShallowRef<RecordingResult | undefined>
  /** why the last recording could not be started or written; cleared by the next `start()` */
  readonly error: ShallowRef<unknown>
  /**
   * Starts a recording, after stopping the one that runs. A failure is not thrown, it ends up in `error`.
   *
   * @returns the recording, or `undefined` if it could not be started
   */
  start(source: RecordingSource, options?: RecordingOptions): Promise<MediaRecording | undefined>
  /**
   * Stops the recording that runs.
   *
   * @returns what it left, which is also in `result`; `undefined` if nothing ran or it could not be written
   */
  stop(): Promise<RecordingResult | undefined>
  pause(): void
  resume(): void
}

/**
 * A recording as reactive state: `start()` it with a session, `stop()` it and read `result`. A recording that ends
 * by itself, because its session ended, leaves its `result` the same way. It is stopped when the component is
 * unmounted.
 */
export const useRecording = (recorder: MediaRecordingManager): UseRecording => {
  const recording = shallowRef<MediaRecording>()
  const state = ref<MediaRecordingState>()
  const duration = ref(0)
  const bytes = ref(0)
  const result = shallowRef<RecordingResult>()
  const error = shallowRef<unknown>()
  let isDisposed = false

  /** what a recording leaves, as a result or as an error, for the one that is current */
  const follow = (started: MediaRecording): Promise<RecordingResult | undefined> =>
    started.finished.then(
      (finished) => {
        if (recording.value === started) {
          recording.value = undefined
          state.value = undefined
          duration.value = finished.duration
          bytes.value = finished.bytes
          result.value = finished
        }

        return finished
      },
      (failure: unknown) => {
        if (recording.value === started) {
          recording.value = undefined
          state.value = undefined
          error.value = failure
        }

        return undefined
      }
    )

  const stop = async (): Promise<RecordingResult | undefined> => {
    const running = recording.value

    if (running === undefined) {
      return undefined
    }

    running.stop().catch(() => undefined)

    return follow(running)
  }

  const start = async (source: RecordingSource, options?: RecordingOptions): Promise<MediaRecording | undefined> => {
    await stop()
    result.value = undefined
    error.value = undefined
    duration.value = 0
    bytes.value = 0

    try {
      const started = await recorder.record(source, options)

      // the component may have been unmounted while the recording was starting
      if (isDisposed) {
        await started.stop().catch(() => undefined)

        return undefined
      }

      started.on('statechange', (changed) => {
        if (recording.value === started && changed !== 'stopped') {
          state.value = changed
        }
      })
      started.on('progress', (progress) => {
        if (recording.value === started) {
          duration.value = progress.duration
          bytes.value = progress.bytes
        }
      })

      recording.value = started
      state.value = started.state
      void follow(started)

      return started
    } catch (failure) {
      error.value = failure

      return undefined
    }
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      isDisposed = true
      void stop()
    })
  }

  return {
    recording,
    state,
    duration,
    bytes,
    result,
    error,
    start,
    stop,
    pause: () => recording.value?.pause(),
    resume: () => recording.value?.resume(),
  }
}
