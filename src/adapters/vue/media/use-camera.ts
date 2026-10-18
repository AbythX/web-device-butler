import type { CameraManager } from '../../../media/camera/camera-manager.ts'
import type { CameraRequirements } from '../../../media/camera/model/camera-requirements.ts'
import type { CameraSession } from '../../../media/camera/session/camera-session.ts'
import { CameraController, type CameraSnapshot } from '../../state/media/camera-controller.ts'
import type { SnapshotRefs } from '../use-controller.ts'
import { bindMediaSession, type UseMediaSession } from './use-media-session.ts'

export interface UseCamera extends UseMediaSession<CameraSession, CameraRequirements>, SnapshotRefs<CameraSnapshot> {}

/**
 * A camera session as reactive state: `open()` and `close()` it, bind `session.value?.stream` to a video element.
 * The session is closed when the component is unmounted.
 *
 * The controls (`session.value?.torch`) are not reactive, because they read from the camera on every access; read
 * them again after a change.
 */
export const useCamera = (manager: CameraManager): UseCamera => bindMediaSession(new CameraController(() => manager))
