import { EventEmitter } from '../../../core/events/event-emitter.ts'
import type { MediaSession, MediaSessionEvents, MediaSessionState } from '../../../media/session/media-session.ts'

/**
 * A session without a device: it only has the state and the events a controller follows.
 */
export class FakeSession extends EventEmitter<MediaSessionEvents> {
  public state: MediaSessionState = 'live'
  public closes = 0

  public static opened(): MediaSession {
    return new FakeSession() as unknown as MediaSession
  }

  public close(): Promise<void> {
    this.closes++

    if (this.state !== 'ended') {
      this.state = 'ended'
      this.emit('ended', { reason: 'closed' })
    }

    return Promise.resolve()
  }

  public changeState(state: MediaSessionState): void {
    this.state = state
    this.emit('statechange', state)
  }
}

/**
 * A manager whose sessions open when the spec says so.
 */
export class FakeOpener {
  public readonly requests: (Partial<Record<string, unknown>> | undefined)[] = []
  private readonly pending: { resolve: (session: MediaSession) => void; reject: (error: unknown) => void }[] = []

  public open(requirements?: Partial<Record<string, unknown>>): Promise<MediaSession> {
    this.requests.push(requirements)

    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }))
  }

  public get waiting(): number {
    return this.pending.length
  }

  /** opens the oldest session that was asked for */
  public succeed(session: MediaSession = FakeSession.opened()): MediaSession {
    this.pending.shift()?.resolve(session)

    return session
  }

  public fail(error: unknown): void {
    this.pending.shift()?.reject(error)
  }
}

export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))

export const fake = (session: MediaSession | undefined): FakeSession => session as unknown as FakeSession
