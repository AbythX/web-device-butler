import { useCallback, useEffect, useRef, useState } from 'react'

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
  const [recording, setRecording] = useState<MediaRecording>()
  const [state, setState] = useState<MediaRecordingState>()
  const [duration, setDuration] = useState(0)
  const [bytes, setBytes] = useState(0)
  const [result, setResult] = useState<RecordingResult>()
  const [error, setError] = useState<unknown>()

  /** the recording that runs, also for the callbacks of a render that is over */
  const current = useRef<MediaRecording | undefined>(undefined)
  const isMounted = useRef(true)

  /** what a recording leaves, as a result or as an error, for the one that is current */
  const follow = useCallback(
    (started: MediaRecording): Promise<RecordingResult | undefined> =>
      started.finished.then(
        (finished) => {
          if (current.current === started) {
            current.current = undefined
            setRecording(undefined)
            setState(undefined)
            setDuration(finished.duration)
            setBytes(finished.bytes)
            setResult(finished)
          }

          return finished
        },
        (failure: unknown) => {
          if (current.current === started) {
            current.current = undefined
            setRecording(undefined)
            setState(undefined)
            setError(failure)
          }

          return undefined
        }
      ),
    []
  )

  const stop = useCallback(async (): Promise<RecordingResult | undefined> => {
    const running = current.current

    if (running === undefined) {
      return undefined
    }

    running.stop().catch(() => undefined)

    return follow(running)
  }, [follow])

  const start = useCallback(
    async (source: RecordingSource, options?: RecordingOptions): Promise<MediaRecording | undefined> => {
      await stop()
      setResult(undefined)
      setError(undefined)
      setDuration(0)
      setBytes(0)

      try {
        const started = await recorder.record(source, options)

        // the component may have been unmounted while the recording was starting
        if (!isMounted.current) {
          await started.stop().catch(() => undefined)

          return undefined
        }

        started.on('statechange', (changed) => {
          if (current.current === started && changed !== 'stopped') {
            setState(changed)
          }
        })
        started.on('progress', (progress) => {
          if (current.current === started) {
            setDuration(progress.duration)
            setBytes(progress.bytes)
          }
        })

        current.current = started
        setRecording(started)
        setState(started.state)
        void follow(started)

        return started
      } catch (failure) {
        setError(failure)

        return undefined
      }
    },
    [recorder, stop, follow]
  )

  const pause = useCallback((): void => current.current?.pause(), [])
  const resume = useCallback((): void => current.current?.resume(), [])

  useEffect(() => {
    isMounted.current = true

    return () => {
      isMounted.current = false
      current.current?.stop().catch(() => undefined)
    }
  }, [])

  return { recording, state, duration, bytes, result, error, start, stop, pause, resume }
}
