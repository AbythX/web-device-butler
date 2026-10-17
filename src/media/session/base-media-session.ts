import '../../core/disposable-polyfill.ts'

import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { Logger } from '../../core/logging/logger.ts'
import type { MediaLease } from '../access/media-lease.ts'
import { MediaError } from '../errors/media-error.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { PlatformQuirk } from '../quirks/platform-quirk.ts'
import { ConstraintQueue } from './constraint-queue.ts'
import type { MediaSessionHold } from './media-session-hold.ts'
import type { MediaSourceKind } from './media-source-kind.ts'
import type { MediaSession, MediaSessionEndReason, MediaSessionEvents, MediaSessionState } from './media-session.ts'

/**
 * The base of the implementations of {@link MediaSession}.
 *
 * @typeParam Hold what the session holds its device with: the lease of a camera or a microphone, or the tracks of a
 *   stream that needs no lock
 */
export abstract class BaseMediaSession<
  Events extends MediaSessionEvents = MediaSessionEvents,
  Hold extends MediaSessionHold = MediaLease,
>
  extends EventEmitter<Events>
  implements MediaSession<Events>
{
  public allowTakeover = true

  private static readonly defaultRecoverMinLifetime = 1000

  /** shared by everything that changes the constraints of the session */
  protected readonly queue: ConstraintQueue

  private currentStream: MediaStream
  private currentState: MediaSessionState
  private ending: Promise<void> | undefined
  private startedAt = Date.now()
  /** switching the device and starting it again never overlap */
  private transition: Promise<unknown> = Promise.resolve()

  protected constructor(
    private readonly kind: MediaSourceKind,
    protected readonly lease: Hold,
    stream: MediaStream,
    quirks: readonly PlatformQuirk[],
    protected readonly logger: Logger
  ) {
    super()

    const track = BaseMediaSession.trackOf(stream)
    this.currentStream = stream
    this.currentState = track.muted ? 'muted' : 'live'
    this.queue = new ConstraintQueue(track, kind, quirks, logger)

    this.listenTo(track)
    lease.onTakeover = () => this.giveUp()
  }

  public get stream(): MediaStream {
    return this.currentStream
  }

  public get track(): MediaStreamTrack {
    return this.queue.track
  }

  public get state(): MediaSessionState {
    return this.currentState
  }

  public close(): Promise<void> {
    return this.end('closed')
  }

  /**
   * Calls {@link close}, so the object can be declared with `await using`.
   */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.close()
  }

  /**
   * @throws SessionClosedError if the session has ended
   */
  protected assertOpen(): void {
    if (this.currentState === 'ended') {
      throw new SessionClosedError()
    }
  }

  /**
   * The picture where the stream has one: a capture of the screen can come with its sound.
   */
  private static trackOf(stream: MediaStream): MediaStreamTrack {
    const [track] = [...stream.getVideoTracks(), ...stream.getAudioTracks()]

    if (track === undefined) {
      throw new MediaError('The browser started a stream without a track')
    }

    return track
  }

  private listenTo(track: MediaStreamTrack): void {
    track.addEventListener('ended', this.trackEnded)
    track.addEventListener('mute', this.trackMuted)
    track.addEventListener('unmute', this.trackUnmuted)
  }

  /**
   * Continues with another stream: the session stays the same object, its track is a new one. The lease has stopped
   * the previous stream when it started this one.
   */
  protected replaceStream(stream: MediaStream): void {
    this.assertOpen()
    const track = BaseMediaSession.trackOf(stream)

    this.stopListeningTo(this.track)
    this.currentStream = stream
    this.startedAt = Date.now()
    this.queue.attach(track)
    this.listenTo(track)
    this.changeState(track.muted ? 'muted' : 'live')
    this.announce('trackchange', track)
  }

  /**
   * For a subclass that stops the device to start it again, or to start another one: the session delivers nothing
   * until {@link replaceStream} or {@link resume}.
   */
  protected suspend(): void {
    this.changeState('muted')
  }

  /**
   * After a {@link suspend} that left the device running.
   */
  protected resume(): void {
    if (this.track.readyState !== 'ended') {
      this.changeState(this.track.muted ? 'muted' : 'live')
    }
  }

  /**
   * Whether the session tries to continue when the device ends the track. Without it the session ends.
   */
  protected get canRecover(): boolean {
    return false
  }

  /**
   * Asked when the device ended the track without the application closing the session, if the session
   * {@link canRecover}. A subclass starts the device again, calls {@link replaceStream} and answers `true`;
   * otherwise the session ends. Until then the session is `muted`.
   */
  protected recover(): Promise<boolean> {
    return Promise.resolve(false)
  }

  /**
   * The usual way to {@link recover}: starts the device again once the user can see the page, because a browser
   * does not start a device for a page nobody looks at.
   *
   * @param restart starts the device and calls {@link replaceStream}
   * @param whenVisible resolves once the user can see the page
   * @param minLifetime a device that ended sooner than this after it was started is not started again, so a device
   *   that cannot run does not restart forever; in milliseconds
   */
  protected recoverWith(
    restart: () => Promise<void>,
    whenVisible: () => Promise<void>,
    minLifetime = BaseMediaSession.defaultRecoverMinLifetime
  ): Promise<boolean> {
    const lifetime = Date.now() - this.startedAt

    if (lifetime < minLifetime) {
      this.logger.warn(`The ${this.kind} ended ${lifetime} ms after it was started, not starting it again`)

      return Promise.resolve(false)
    }

    return this.exclusively(async () => {
      await whenVisible()

      if (this.currentState === 'ended') {
        return false
      }

      await restart()

      return true
    })
  }

  /**
   * Runs the task once the ones before it have finished: what stops a device to start it again, or to start another
   * one, must not meet the next such change halfway.
   */
  protected exclusively<Result>(task: () => Promise<Result>): Promise<Result> {
    const result = this.transition.then(task)
    this.transition = result.catch(() => undefined)

    return result
  }

  /**
   * Ends the session because its device is gone.
   */
  protected abandon(): Promise<void> {
    return this.end('device')
  }

  private stopListeningTo(track: MediaStreamTrack): void {
    track.removeEventListener('ended', this.trackEnded)
    track.removeEventListener('mute', this.trackMuted)
    track.removeEventListener('unmute', this.trackUnmuted)
  }

  private readonly trackEnded = (): void => {
    this.logger.debug('The device ended the track')
    void this.recoverOrEnd()
  }

  private async recoverOrEnd(): Promise<void> {
    let hasRecovered = false

    if (this.canRecover) {
      this.changeState('muted')

      try {
        hasRecovered = await this.recover()
      } catch (error) {
        this.logger.warn('Could not start the device again', error)
      }
    }

    if (!hasRecovered) {
      await this.end('device')
    }
  }

  private readonly trackMuted = (): void => this.changeState('muted')

  private readonly trackUnmuted = (): void => this.changeState('live')

  private async giveUp(): Promise<boolean> {
    if (!this.allowTakeover) {
      return false
    }

    await this.end('taken-over')

    return true
  }

  private end(reason: MediaSessionEndReason): Promise<void> {
    this.ending ??= this.finish(reason)

    return this.ending
  }

  private async finish(reason: MediaSessionEndReason): Promise<void> {
    this.stopListeningTo(this.track)

    this.lease.onTakeover = undefined
    this.queue.close()
    // the device stops right away, the lock follows
    this.lease.stop()
    this.changeState('ended')

    await this.lease.release()

    this.announce('ended', { reason })
    this.removeAllListeners()
  }

  private changeState(state: MediaSessionState): void {
    if (state !== this.currentState && this.currentState !== 'ended') {
      this.currentState = state
      this.announce('statechange', state)
    }
  }

  private announce<Type extends keyof MediaSessionEvents>(type: Type, payload: MediaSessionEvents[Type]): void {
    // SAFETY: Events extends MediaSessionEvents, and an extension cannot change the payload of an event the base
    // declares
    this.emitSafely(type, payload as Events[Type], this.logger)
  }
}
