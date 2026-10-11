import { shallowRef, watch, type ShallowRef } from 'vue'

import type { CameraManager } from '../../media/camera/camera-manager.ts'
import type { CameraDescriptor } from '../../media/camera/model/camera-descriptor.ts'
import type { CameraRequirements } from '../../media/camera/model/camera-requirements.ts'
import type { CameraSettings } from '../../media/camera/model/camera-settings.ts'
import type { CameraSession } from '../../media/camera/session/camera-session.ts'
import { useMediaSession, type UseMediaSession } from './use-media-session.ts'

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
export const useCamera = (manager: CameraManager): UseCamera => {
  const media = useMediaSession(manager)
  const descriptor = shallowRef<CameraDescriptor>()
  const settings = shallowRef<CameraSettings>()

  watch(
    media.session,
    (session) => {
      descriptor.value = session?.descriptor
      settings.value = session?.settings

      session?.on('devicechange', (changed) => (descriptor.value = changed))
      session?.on('settingschange', (changed) => (settings.value = changed))
    },
    { flush: 'sync' }
  )

  return { ...media, descriptor, settings }
}
