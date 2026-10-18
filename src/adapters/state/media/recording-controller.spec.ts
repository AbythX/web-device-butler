import { describe, expect, test } from 'vitest'

import { EventEmitter } from '../../../core/events/event-emitter.ts'
import type { MediaRecording, RecordingResult, RecordingSource } from '../../../media/recording/media-recording.ts'
import type { MediaRecordingManager } from '../../../media/recording/media-recording-manager.ts'
import { RecordingController } from './recording-controller.ts'

class FakeRecording extends EventEmitter<Record<string, unknown>> {
  public state = 'recording'
  public stops = 0
  public readonly finished: Promise<RecordingResult>
  private finish!: (result: RecordingResult) => void

  public constructor() {
    super()
    this.finished = new Promise((resolve) => (this.finish = resolve))
  }

  public stop(): Promise<RecordingResult> {
    this.stops++
    this.end(1000)

    return this.finished
  }

  public end(duration: number): void {
    this.finish({ duration, bytes: duration * 10 } as RecordingResult)
  }

  public announce(type: string, payload: unknown): void {
    this.emit(type, payload)
  }
}

describe('recording-controller', () => {
  const create = () => {
    const recordings: FakeRecording[] = []

    const recorder = {
      record: async () => {
        const recording = new FakeRecording()
        recordings.push(recording)

        return recording as unknown as MediaRecording
      },
    } as unknown as MediaRecordingManager

    return { recordings, sut: new RecordingController(() => recorder) }
  }

  const source = {} as RecordingSource

  test('should follow a recording and keep what it left', async () => {
    const { recordings, sut } = create()

    await sut.start(source)
    recordings[0]?.announce('progress', { duration: 500, bytes: 5000 })
    expect(sut.read()).toMatchObject({ state: 'recording', duration: 500, bytes: 5000 })

    const result = await sut.stop()

    expect(result).toEqual({ duration: 1000, bytes: 10_000 })
    expect(sut.read()).toMatchObject({ recording: undefined, state: undefined, result, duration: 1000 })
  })

  test('should keep the result of a recording that ended by itself', async () => {
    const { recordings, sut } = create()
    await sut.start(source)

    recordings[0]?.end(300)
    await Promise.resolve()

    expect(sut.read()).toMatchObject({ recording: undefined, result: { duration: 300 } })
  })

  test('should stop the recording when the component goes away, and one that arrives later', async () => {
    const { recordings, sut } = create()
    await sut.start(source)

    sut.deactivate()
    expect(recordings[0]?.stops).toBe(1)

    expect(await sut.start(source)).toBeUndefined()
    expect(recordings[1]?.stops).toBe(1)
  })
})
