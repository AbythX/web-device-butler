import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'

/**
 * `MediaRecorder` for specs. Like the one of a browser it hands over its last piece and reports that it stopped a
 * moment after it was told to, and it can stop by itself, as a browser does when the tracks of its stream change.
 */
export class FakeMediaRecorder extends FakeEventTarget {
  /** every recorder that was created, in order */
  public static instances: FakeMediaRecorder[] = []
  /** the formats this browser can write */
  public static supported: readonly string[] = ['video/webm', 'audio/webm']
  /** what the browser writes when it is not told */
  public static defaultFormat = 'video/webm'
  /** makes the next recorders refuse to start */
  public static startError: unknown
  /** what the browser adds to the format it was asked for, such as the codecs it chose */
  public static details = ''

  public static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supported.includes(type)
  }

  public static reset(): void {
    FakeMediaRecorder.instances = []
    FakeMediaRecorder.supported = ['video/webm', 'audio/webm']
    FakeMediaRecorder.defaultFormat = 'video/webm'
    FakeMediaRecorder.startError = undefined
    FakeMediaRecorder.details = ''
  }

  /** the recorder that was created last */
  public static get last(): FakeMediaRecorder {
    const last = FakeMediaRecorder.instances.at(-1)

    if (last === undefined) {
      throw new Error('No recorder was created')
    }

    return last
  }

  public state: 'inactive' | 'recording' | 'paused' = 'inactive'
  public readonly mimeType: string
  public timeslice: number | undefined

  public constructor(
    public readonly stream: object,
    public readonly options: MediaRecorderOptions = {}
  ) {
    super()
    this.mimeType = (options.mimeType ?? FakeMediaRecorder.defaultFormat) + FakeMediaRecorder.details
    FakeMediaRecorder.instances.push(this)
  }

  public start(timeslice?: number): void {
    if (FakeMediaRecorder.startError !== undefined) {
      throw FakeMediaRecorder.startError
    }

    this.state = 'recording'
    this.timeslice = timeslice
  }

  public pause(): void {
    this.state = 'paused'
  }

  public resume(): void {
    this.state = 'recording'
  }

  public stop(): void {
    if (this.state === 'inactive') {
      throw Object.assign(new Error('The recorder is inactive'), { name: 'InvalidStateError' })
    }

    this.state = 'inactive'

    queueMicrotask(() => {
      this.deliver('end')
      this.dispatch('stop')
    })
  }

  public requestData(): void {
    this.deliver('flushed ')
  }

  /**
   * The recorder hands over a piece of what it recorded.
   */
  public deliver(text: string): void {
    this.dispatch('dataavailable', { data: new Blob([text]) })
  }

  /**
   * The browser ends the file, because a track of the stream ended or was replaced.
   */
  public interrupt(): void {
    this.stop()
  }
}
