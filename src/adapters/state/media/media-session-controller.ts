import type { MediaSession, MediaSessionEnd, MediaSessionState } from '../../../media/session/media-session.ts'
import { StateController } from '../state-controller.ts'

/**
 * What opens the sessions: the manager of the cameras, of the microphones or of the capture of the screen.
 */
export interface MediaSessionOpener<TSession, TRequirements> {
  open(requirements?: Partial<TRequirements>): Promise<TSession>
}

export interface MediaSessionSnapshot<TSession> {
  /** the open session; `undefined` before `open()` and after the session ended */
  readonly session: TSession | undefined
  /** `undefined` while there is no session */
  readonly state: MediaSessionState | undefined
  /** `true` between the call of `open()` and its outcome */
  readonly isOpening: boolean
  /** why the last `open()` failed; cleared by the next one */
  readonly error: unknown
  /** why the last session ended */
  readonly ended: MediaSessionEnd | undefined
}

/**
 * One session of a manager at a time. Shared by `useCamera`, `useMicrophone` and `useScreenCapture` of both adapters.
 *
 * A subclass follows more of the session than its state: it adds the fields to `Snapshot` and fills them in
 * {@link follow}.
 */
export class MediaSessionController<
  TSession extends MediaSession,
  TRequirements,
  Snapshot extends MediaSessionSnapshot<TSession> = MediaSessionSnapshot<TSession>,
> extends StateController<Snapshot> {
  private openings = 0
  /** calls of `open()` run one after another, so each one finds the session of the one before it */
  private turn: Promise<unknown> = Promise.resolve()

  /**
   * @param manager the manager that opens the next session; a getter, so a component can hand over another one
   * @param extras the first values of what a subclass adds to the snapshot
   */
  public constructor(
    private readonly manager: () => MediaSessionOpener<TSession, TRequirements>,
    extras: Omit<Snapshot, keyof MediaSessionSnapshot<TSession>>
  ) {
    // SAFETY: the fields of a session and the extras of the subclass are all the fields of the snapshot
    super({
      session: undefined,
      state: undefined,
      isOpening: false,
      error: undefined,
      ended: undefined,
      ...extras,
    } as Snapshot)
  }

  /**
   * Opens a session, after closing the one that is open. A failure is not thrown, it ends up in `error`.
   *
   * @returns the session, or `undefined` if it could not be opened
   */
  public readonly open = (requirements?: Partial<TRequirements>): Promise<TSession | undefined> => {
    this.openings++
    this.changeSession({ error: undefined, isOpening: true })

    const opening = this.turn.then(() => this.start(requirements))
    this.turn = opening

    return opening
  }

  /**
   * Closes the session that is open, if there is one.
   */
  public readonly close = async (): Promise<void> => {
    await this.read().session?.close()
  }

  /**
   * Starts following another session, or none, and stops following the one before.
   *
   * @returns what the subclass adds to the snapshot for that session
   */
  protected follow(_session: TSession | undefined): Partial<Snapshot> {
    return {}
  }

  protected override onDeactivate(): void {
    void this.close()
  }

  private async start(requirements?: Partial<TRequirements>): Promise<TSession | undefined> {
    try {
      if (!this.isActive) {
        return undefined
      }

      await this.close()
      const opened = await this.manager().open(requirements)

      // the component may have gone away while the device was starting
      if (!this.isActive) {
        await opened.close()

        return undefined
      }

      opened.on('statechange', (changed) => {
        if (this.read().session === opened) {
          this.changeSession({ state: changed })
        }
      })
      opened.on('ended', (end) => {
        if (this.read().session === opened) {
          this.changeSession({ session: undefined, state: undefined, ended: end }, this.follow(undefined))
        }
      })

      this.changeSession({ session: opened, state: opened.state }, this.follow(opened))

      return opened
    } catch (failure) {
      this.changeSession({ error: failure })

      return undefined
    } finally {
      this.changeSession({ isOpening: --this.openings > 0 })
    }
  }

  private changeSession(fields: Partial<MediaSessionSnapshot<TSession>>, extras: Partial<Snapshot> = {}): void {
    // SAFETY: Snapshot extends the snapshot of a session, so these fields have the types it declares
    this.change({ ...(fields as Partial<Snapshot>), ...extras })
  }
}
