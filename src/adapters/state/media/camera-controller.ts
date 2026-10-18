import type { EventSubscription } from '../../../core/events/event-subscription.ts'
import type { CameraManager } from '../../../media/camera/camera-manager.ts'
import type { CameraDescriptor } from '../../../media/camera/model/camera-descriptor.ts'
import type { CameraRequirements } from '../../../media/camera/model/camera-requirements.ts'
import type { CameraSettings } from '../../../media/camera/model/camera-settings.ts'
import type { CameraSession } from '../../../media/camera/session/camera-session.ts'
import { MediaSessionController, type MediaSessionSnapshot } from './media-session-controller.ts'

export interface CameraSnapshot extends MediaSessionSnapshot<CameraSession> {
  /** the camera the session runs; follows `switchTo()` */
  readonly descriptor: CameraDescriptor | undefined
  /** what the camera delivers; follows `configure()` and `switchTo()` */
  readonly settings: CameraSettings | undefined
}

/**
 * A camera session, with the camera it runs and what it delivers. Shared by `useCamera` of both adapters.
 */
export class CameraController extends MediaSessionController<CameraSession, CameraRequirements, CameraSnapshot> {
  private following: EventSubscription[] = []

  public constructor(manager: () => CameraManager) {
    super(manager, { descriptor: undefined, settings: undefined })
  }

  protected override follow(session: CameraSession | undefined): Partial<CameraSnapshot> {
    this.following.forEach((subscription) => subscription.unsubscribe())
    this.following =
      session === undefined
        ? []
        : [
            session.on('devicechange', (descriptor) => this.change({ descriptor })),
            session.on('settingschange', (settings) => this.change({ settings })),
          ]

    return { descriptor: session?.descriptor, settings: session?.settings }
  }
}
