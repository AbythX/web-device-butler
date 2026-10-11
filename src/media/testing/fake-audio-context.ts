/**
 * An `AudioContext` for specs, as far as measuring the level of a microphone needs it. Every analyser of every
 * context delivers a constant signal of the amplitude {@link FakeAudioContext.amplitude}.
 */
export class FakeAudioContext {
  /** what the microphones of the spec deliver; the level of a constant signal is its amplitude */
  public static amplitude = 0.5
  /** every context that was created, in order */
  public static readonly instances: FakeAudioContext[] = []

  public state: 'suspended' | 'running' | 'closed' = 'suspended'
  /** the streams that were connected, in order */
  public readonly sources: MediaStream[] = []
  /** how many sources are connected right now */
  public connected = 0

  public constructor() {
    FakeAudioContext.instances.push(this)
  }

  public static reset(): void {
    FakeAudioContext.amplitude = 0.5
    FakeAudioContext.instances.length = 0
  }

  public createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode {
    this.sources.push(stream)

    return {
      connect: () => {
        this.connected++
      },
      disconnect: () => {
        this.connected--
      },
    } as unknown as MediaStreamAudioSourceNode
  }

  public createAnalyser(): AnalyserNode {
    return {
      fftSize: 2048,
      getFloatTimeDomainData: (samples: Float32Array) => {
        const [stream] = this.sources.slice(-1)
        const isSilent = stream?.getAudioTracks().every((track) => !track.enabled) ?? true
        samples.fill(isSilent ? 0 : FakeAudioContext.amplitude)
      },
    } as unknown as AnalyserNode
  }

  public async resume(): Promise<void> {
    this.state = 'running'
  }

  public async close(): Promise<void> {
    this.state = 'closed'
  }
}
