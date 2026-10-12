import '../../../core/disposable-polyfill.ts'

import type { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { EventEmitter } from '../../../core/events/event-emitter.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import type { LevelMeter, LevelMeterEvents } from './level-meter.ts'

/**
 * The implementation of {@link LevelMeter}.
 */
export class DefaultLevelMeter extends EventEmitter<LevelMeterEvents> implements LevelMeter, Disposable {
  private static readonly defaultInterval = 100
  private static readonly sampleCount = 2048

  private context: AudioContext | undefined
  private source: MediaStreamAudioSourceNode | undefined
  private analyser: AnalyserNode | undefined
  private samples: Float32Array<ArrayBuffer> | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private lastLevel = 0

  /**
   * @param interval how often the level is measured, in milliseconds
   */
  public constructor(
    private stream: MediaStream,
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger,
    private readonly interval = DefaultLevelMeter.defaultInterval
  ) {
    super()
  }

  public get isRunning(): boolean {
    return this.timer !== undefined
  }

  public get level(): number {
    return this.lastLevel
  }

  /**
   * Continues with another stream, after the microphone was started again.
   */
  public attach(stream: MediaStream): void {
    this.stream = stream

    if (this.isRunning) {
      this.connect()
    }
  }

  /**
   * Stops measuring and forgets every listener.
   */
  public dispose(): void {
    this.removeAllListeners()
    this.stop()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  protected override onFirstListener(): void {
    this.start()
  }

  protected override onLastListenerRemoved(): void {
    this.stop()
  }

  private start(): void {
    try {
      this.context = this.environment.createAudioContext()

      if (this.context === undefined) {
        this.logger.warn('The level of the microphone cannot be measured, the browser has no Web Audio')

        return
      }

      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = DefaultLevelMeter.sampleCount
      this.samples = new Float32Array(DefaultLevelMeter.sampleCount)
      this.connect()

      // a browser creates the context suspended if the page has not been interacted with yet
      void this.context
        .resume?.()
        .catch((error: unknown) => this.logger.debug('Could not start the audio context', error))
      this.timer = setInterval(() => this.measure(), this.interval)
    } catch (error) {
      this.logger.warn('Could not measure the level of the microphone', error)
      this.stop()
    }
  }

  private connect(): void {
    if (this.context === undefined || this.analyser === undefined) {
      return
    }

    this.source?.disconnect()
    this.source = this.context.createMediaStreamSource(this.stream)
    this.source.connect(this.analyser)
  }

  private stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.lastLevel = 0

    this.source?.disconnect()
    this.source = undefined
    this.analyser = undefined
    this.samples = undefined

    void this.context?.close().catch((error: unknown) => this.logger.debug('Could not close the audio context', error))
    this.context = undefined
  }

  private measure(): void {
    // a context that the browser has not let run yet delivers silence, which would look like a dead microphone
    if (this.analyser === undefined || this.samples === undefined || this.context?.state !== 'running') {
      return
    }

    this.analyser.getFloatTimeDomainData(this.samples)
    let squares = 0

    for (const sample of this.samples) {
      squares += sample * sample
    }

    this.lastLevel = Math.min(1, Math.sqrt(squares / this.samples.length))
    this.emitSafely('change', this.lastLevel, this.logger)
  }
}
