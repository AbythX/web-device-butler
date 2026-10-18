import type { ShallowRef } from 'vue'

import type { CameraManager } from '../../../media/camera/camera-manager.ts'
import type { CameraDescriptor } from '../../../media/camera/model/camera-descriptor.ts'
import type { CameraRequirements } from '../../../media/camera/model/camera-requirements.ts'
import type { CameraSettings } from '../../../media/camera/model/camera-settings.ts'
import type { CameraSession } from '../../../media/camera/session/camera-session.ts'
import { CameraController } from '../../state/media/camera-controller.ts'
import { bindMediaSession, type UseMediaSession } from './use-media-session.ts'

export interface UseCamera extends UseMediaSession<CameraSession, CameraRequirements> {
  /** the camera the session runs; follows `switchTo()` */
  readonly descriptor: ShallowRef<CameraDescriptor | undefined>
  /** what the camera delivers; follows `configure()` and `switchTo()` */
  readonly settings: ShallowRef<CameraSettings | undefined>
}

/**
 * A camera session as reactive state: `open()` and `close()` it, bind `session.value?.stream` to a video element.
 * The session is closed when the component is unmounted.
 *
 * The controls (`session.value?.torch`) are not reactive, because they read from the camera on every access; read
 * them again after a change.
 */
export const useCamera = (manager: CameraManager): UseCamera => bindMediaSession(new CameraController(() => manager))
