import '../../core/disposable-polyfill.ts'

import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import type { CameraSession } from '../camera/session/camera-session.ts'
import type { MicrophoneSession } from '../microphone/session/microphone-session.ts'
import type { MediaSessionState } from '../session/media-session.ts'
import type {
  CombinedMediaSession,
  CombinedMediaSessionEnd,
  CombinedMediaSessionEvents,
} from './combined-media-session.ts'

/**
 * The implementation of {@link CombinedMediaSession}.
 */
export class DefaultCombinedMediaSession
  extends EventEmitter<CombinedMediaSessionEvents>
  implements CombinedMediaSession
{
  private readonly subscriptions: EventSubscription[]
  private currentState: MediaSessionState
  private ending: Promise<void> | undefined

  /**
   * @param stream an empty stream of the browser; the session puts the tracks of both devices into it
   */
  public constructor(
    public readonly camera: CameraSession,
    public readonly microphone: MicrophoneSession,
    public readonly stream: MediaStream,
    private readonly logger: Logger
  ) {
    super()

    stream.addTrack(camera.track)
    stream.addTrack(microphone.track)
    this.currentState = this.combinedState

    let cameraTrack = camera.track
    let microphoneTrack = microphone.track
    this.subscriptions = [
      camera.on('statechange', () => this.follow()),
      microphone.on('statechange', () => this.follow()),
      // a device that was started again or replaced has a new track; the stream stays the same object
      camera.on('trackchange', (track) => {
        this.replace(cameraTrack, track)
        cameraTrack = track
      }),
      microphone.on('trackchange', (track) => {
        this.replace(microphoneTrack, track)
        microphoneTrack = track
      }),
      camera.on('ended', ({ reason }) => void this.end({ reason, source: 'camera' })),
      microphone.on('ended', ({ reason }) => void this.end({ reason, source: 'microphone' })),
    ]
  }

  public get state(): MediaSessionState {
    return this.currentState
  }

  public get allowTakeover(): boolean {
    return this.camera.allowTakeover && this.microphone.allowTakeover
  }

  public set allowTakeover(allowTakeover: boolean) {
    this.camera.allowTakeover = allowTakeover
    this.microphone.allowTakeover = allowTakeover
  }

  public close(): Promise<void> {
    return this.end({ reason: 'closed' })
  }

  /**
   * Calls {@link close}, so the object can be declared with `await using`.
   */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.close()
  }

  private get combinedState(): MediaSessionState {
    const states = new Set([this.camera.state, this.microphone.state])

    if (states.has('ended')) {
      return 'ended'
    }

    return states.has('muted') ? 'muted' : 'live'
  }

  private follow(): void {
    this.changeState(this.combinedState)
  }

  private replace(previous: MediaStreamTrack, next: MediaStreamTrack): void {
    this.stream.removeTrack(previous)
    this.stream.addTrack(next)
  }

  private end(end: CombinedMediaSessionEnd): Promise<void> {
    this.ending ??= this.finish(end)

    return this.ending
  }

  private async finish(end: CombinedMediaSessionEnd): Promise<void> {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe())
    this.changeState('ended')

    const closed = await Promise.allSettled([this.camera.close(), this.microphone.close()])

    for (const result of closed) {
      if (result.status === 'rejected') {
        this.logger.error('Could not close a device of the combined session', result.reason)
      }
    }

    this.emitSafely('ended', end, this.logger)
    this.removeAllListeners()
  }

  private changeState(state: MediaSessionState): void {
    if (state !== this.currentState && this.currentState !== 'ended') {
      this.currentState = state
      this.emitSafely('statechange', state, this.logger)
    }
  }
}
