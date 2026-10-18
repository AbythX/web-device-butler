import type {
  MediaRecording,
  RecordingOptions,
  RecordingResult,
  RecordingSource,
} from '../../../media/recording/media-recording.ts'
import type { MediaRecordingManager } from '../../../media/recording/media-recording-manager.ts'
import { RecordingController, type RecordingSnapshot } from '../../state/media/recording-controller.ts'
import { useController, useLatest, useSnapshot } from '../use-controller.ts'

export interface UseRecording extends RecordingSnapshot {
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
 * A recording as state of a component: `start()` it with a session, `stop()` it and read `result`. A recording
 * that ends by itself, because its session ended, leaves its `result` the same way. It is stopped when the
 * component is unmounted.
 */
export const useRecording = (recorder: MediaRecordingManager): UseRecording => {
  const latest = useLatest(recorder)
  const controller = useController(() => new RecordingController(() => latest.current))
  const snapshot = useSnapshot(controller)

  return {
    ...snapshot,
    start: controller.start,
    stop: controller.stop,
    pause: controller.pause,
    resume: controller.resume,
  }
}
