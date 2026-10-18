import type { CameraManager } from '../../../media/camera/camera-manager.ts'
import type { CameraDescriptor } from '../../../media/camera/model/camera-descriptor.ts'
import type { CameraRequirements } from '../../../media/camera/model/camera-requirements.ts'
import type { CameraSettings } from '../../../media/camera/model/camera-settings.ts'
import type { CameraSession } from '../../../media/camera/session/camera-session.ts'
import { CameraController } from '../../state/media/camera-controller.ts'
import { useLatest } from '../use-controller.ts'
import { useMediaSessionOf, type UseMediaSession } from './use-media-session.ts'

export interface UseCamera extends UseMediaSession<CameraSession, CameraRequirements> {
  /** the camera the session runs; follows `switchTo()` */
  readonly descriptor: CameraDescriptor | undefined
  /** what the camera delivers; follows `configure()` and `switchTo()` */
  readonly settings: CameraSettings | undefined
}

/**
 * A camera session as state of a component: `open()` and `close()` it, give `session?.stream` to a video element.
 * The session is closed when the component is unmounted.
 *
 * The controls (`session?.torch`) are not state, because they read from the camera on every access; read them
 * again after a change.
 */
export const useCamera = (manager: CameraManager): UseCamera => {
  const latest = useLatest(manager)
  const [camera] = useMediaSessionOf(() => new CameraController(() => latest.current))

  return camera
}
