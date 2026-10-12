import { EventEmitter } from '../../../core/events/event-emitter.ts'
import type { MediaSessionState } from '../../session/media-session.ts'
import { FakeMediaStream } from '../../testing/fake-media-stream.ts'
import { FakeMediaStreamTrack } from '../../testing/fake-media-stream-track.ts'
import type { RecordingSource, RecordingSourceEvents } from '../media-recording.ts'

/**
 * A session that can be recorded, for specs.
 */
export class FakeRecordingSource extends EventEmitter<RecordingSourceEvents> implements RecordingSource {
  public stream: MediaStream
  public state: MediaSessionState = 'live'
  public allowTakeover = true

  public constructor(private readonly kind: 'audio' | 'video' = 'video') {
    super()
    this.stream = this.createStream()
  }

  /** the device stops delivering, as it does while it is started again */
  public suspend(): void {
    this.change('muted')
  }

  /** the device delivers again, through a new stream */
  public deliver(): void {
    this.stream = this.createStream()
    this.change('live')
  }

  public end(): void {
    this.change('ended')
    this.emit('ended', { reason: 'device' })
  }

  private change(state: MediaSessionState): void {
    this.state = state
    this.emit('statechange', state)
  }

  private createStream(): MediaStream {
    const track = new FakeMediaStreamTrack({ kind: this.kind, deviceId: 'device-0', label: 'Device' })

    return new FakeMediaStream([track]) as unknown as MediaStream
  }
}
