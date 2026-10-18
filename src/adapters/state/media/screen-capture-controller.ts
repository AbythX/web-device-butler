import type { EventSubscription } from '../../../core/events/event-subscription.ts'
import type { ScreenCaptureRequirements } from '../../../media/screen-capture/model/screen-capture-requirements.ts'
import type { ScreenCaptureSettings } from '../../../media/screen-capture/model/screen-capture-settings.ts'
import type { ScreenCaptureManager } from '../../../media/screen-capture/screen-capture-manager.ts'
import type { ScreenCaptureSession } from '../../../media/screen-capture/session/screen-capture-session.ts'
import { MediaSessionController, type MediaSessionSnapshot } from './media-session-controller.ts'

export interface ScreenCaptureSnapshot extends MediaSessionSnapshot<ScreenCaptureSession> {
  /** what the capture delivers, and what the user chose to share; follows a shared window that is resized */
  readonly settings: ScreenCaptureSettings | undefined
}

/**
 * A capture of the screen, with what it delivers. Shared by `useScreenCapture` of both adapters.
 */
export class ScreenCaptureController extends MediaSessionController<
  ScreenCaptureSession,
  ScreenCaptureRequirements,
  ScreenCaptureSnapshot
> {
  private following: EventSubscription | undefined

  public constructor(manager: () => ScreenCaptureManager) {
    super(manager, { settings: undefined })
  }

  protected override follow(session: ScreenCaptureSession | undefined): Partial<ScreenCaptureSnapshot> {
    this.following?.unsubscribe()
    this.following = session?.on('settingschange', (settings) => this.change({ settings }))

    return { settings: session?.settings }
  }
}
