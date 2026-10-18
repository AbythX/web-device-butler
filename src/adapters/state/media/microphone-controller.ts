import type { EventSubscription } from '../../../core/events/event-subscription.ts'
import type { MicrophoneManager } from '../../../media/microphone/microphone-manager.ts'
import type { MicrophoneRequirements } from '../../../media/microphone/model/microphone-requirements.ts'
import type { MicrophoneSettings } from '../../../media/microphone/model/microphone-settings.ts'
import type { MicrophoneSession } from '../../../media/microphone/session/microphone-session.ts'
import { MediaSessionController, type MediaSessionSnapshot } from './media-session-controller.ts'

export interface MicrophoneSnapshot extends MediaSessionSnapshot<MicrophoneSession> {
  /** what the microphone delivers; follows `session.processing.set()` */
  readonly settings: MicrophoneSettings | undefined
  /** whether the application muted the microphone */
  readonly muted: boolean
  /** from `0` to `1`; stays `0` unless the level is measured */
  readonly level: number
}

/**
 * A microphone session, with what it delivers, whether it is muted and how loud it is. Shared by `useMicrophone` of
 * both adapters.
 */
export class MicrophoneController extends MediaSessionController<
  MicrophoneSession,
  MicrophoneRequirements,
  MicrophoneSnapshot
> {
  private following: EventSubscription[] = []
  private measuring: EventSubscription | undefined

  /**
   * @param measuresLevel whether the level is measured while a session runs, which costs an audio context
   */
  public constructor(
    manager: () => MicrophoneManager,
    private measuresLevel: boolean
  ) {
    super(manager, { settings: undefined, muted: false, level: 0 })
  }

  /**
   * Mutes and unmutes; a session that is opened later continues the way the last one was left.
   */
  public readonly setMuted = (muted: boolean): void => {
    this.change({ muted })

    const session = this.read().session

    if (session !== undefined) {
      session.muted = muted
    }
  }

  /**
   * Starts or stops measuring the level of the session that runs and of the ones that follow.
   */
  public setMeasuresLevel(measuresLevel: boolean): void {
    if (measuresLevel !== this.measuresLevel) {
      this.measuresLevel = measuresLevel
      this.measure(this.read().session)
      this.change({ level: 0 })
    }
  }

  protected override follow(session: MicrophoneSession | undefined): Partial<MicrophoneSnapshot> {
    this.following.forEach((subscription) => subscription.unsubscribe())
    this.following = []

    if (session !== undefined) {
      // a new session continues the way the application left the last one
      session.muted = this.read().muted
      this.following = [
        session.on('settingschange', (settings) => this.change({ settings })),
        session.on('mutechange', (muted) => this.change({ muted })),
      ]
    }

    this.measure(session)

    return { settings: session?.settings, level: 0 }
  }

  private measure(session: MicrophoneSession | undefined): void {
    this.measuring?.unsubscribe()
    this.measuring = this.measuresLevel ? session?.level?.on('change', (level) => this.change({ level })) : undefined
  }
}
