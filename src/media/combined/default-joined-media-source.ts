import '../../core/disposable-polyfill.ts'

import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { MediaSession, MediaSessionState } from '../session/media-session.ts'
import type { JoinedMediaSource, JoinedMediaSourceEnd, JoinedMediaSourceEvents } from './joined-media-source.ts'

/**
 * The implementation of {@link JoinedMediaSource}.
 */
export class DefaultJoinedMediaSource extends EventEmitter<JoinedMediaSourceEvents> implements JoinedMediaSource {
  /** which tracks of the stream belong to which session */
  private readonly tracks = new Map<MediaSession, MediaStreamTrack[]>()
  private readonly subscriptions: EventSubscription[] = []
  private currentState: MediaSessionState
  private isEnded = false

  /**
   * @param stream an empty stream of the browser; the source puts the tracks of every session into it
   * @throws SessionClosedError if one of the sessions has ended
   */
  public constructor(
    public readonly sources: readonly MediaSession[],
    public readonly stream: MediaStream,
    private readonly logger: Logger
  ) {
    super()

    if (sources.some((source) => source.state === 'ended')) {
      throw new SessionClosedError('A session that has ended cannot be joined')
    }

    for (const source of sources) {
      this.adopt(source)

      this.subscriptions.push(
        source.on('statechange', () => this.follow()),
        // a session that continues with a new track keeps its place in the stream
        source.on('trackchange', () => this.adopt(source)),
        source.on('ended', ({ reason }) => this.end({ reason, source }))
      )
    }

    this.currentState = this.joinedState
  }

  public get state(): MediaSessionState {
    return this.currentState
  }

  public get allowTakeover(): boolean {
    return this.sources.every((source) => source.allowTakeover)
  }

  public set allowTakeover(allowTakeover: boolean) {
    this.sources.forEach((source) => (source.allowTakeover = allowTakeover))
  }

  public dispose(): void {
    this.end({ reason: 'closed' })
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  private get joinedState(): MediaSessionState {
    const states = new Set(this.sources.map((source) => source.state))

    if (states.has('ended')) {
      return 'ended'
    }

    return states.has('muted') ? 'muted' : 'live'
  }

  /**
   * Puts the current tracks of the session into the stream, in place of the ones it had.
   */
  private adopt(source: MediaSession): void {
    for (const track of this.tracks.get(source) ?? []) {
      this.stream.removeTrack(track)
    }

    const tracks = source.stream.getTracks()
    tracks.forEach((track) => this.stream.addTrack(track))
    this.tracks.set(source, tracks)
  }

  private follow(): void {
    this.changeState(this.joinedState)
  }

  private end(end: JoinedMediaSourceEnd): void {
    if (this.isEnded) {
      return
    }

    this.isEnded = true
    this.subscriptions.forEach((subscription) => subscription.unsubscribe())
    this.changeState('ended')
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
