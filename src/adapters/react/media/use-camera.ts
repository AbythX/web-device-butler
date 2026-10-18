import type { CameraManager } from '../../../media/camera/camera-manager.ts'
import type { CameraRequirements } from '../../../media/camera/model/camera-requirements.ts'
import type { CameraSession } from '../../../media/camera/session/camera-session.ts'
import { CameraController, type CameraSnapshot } from '../../state/media/camera-controller.ts'
import { useLatest } from '../use-controller.ts'
import { useMediaSessionOf, type UseMediaSession } from './use-media-session.ts'

export interface UseCamera extends UseMediaSession<CameraSession, CameraRequirements>, CameraSnapshot {}

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
