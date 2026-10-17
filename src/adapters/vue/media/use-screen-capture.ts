import { shallowRef, watch, type ShallowRef } from 'vue'

import type { ScreenCaptureRequirements } from '../../../media/screen-capture/model/screen-capture-requirements.ts'
import type { ScreenCaptureSettings } from '../../../media/screen-capture/model/screen-capture-settings.ts'
import type { ScreenCaptureManager } from '../../../media/screen-capture/screen-capture-manager.ts'
import type { ScreenCaptureSession } from '../../../media/screen-capture/session/screen-capture-session.ts'
import { useMediaSession, type UseMediaSession } from './use-media-session.ts'

export interface UseScreenCapture extends UseMediaSession<ScreenCaptureSession, ScreenCaptureRequirements> {
  /** what the capture delivers, and what the user chose to share; follows a shared window that is resized */
  readonly settings: ShallowRef<ScreenCaptureSettings | undefined>
}

/**
 * A capture of the screen as reactive state: `open()` it from a click handler, bind `session.value?.stream` to a
 * video element. `ended` says `device` when the user stopped sharing. The capture is stopped when the component is
 * unmounted.
 */
export const useScreenCapture = (manager: ScreenCaptureManager): UseScreenCapture => {
  const media = useMediaSession(manager)
  const settings = shallowRef<ScreenCaptureSettings>()

  watch(
    media.session,
    (session) => {
      settings.value = session?.settings

      session?.on('settingschange', (changed) => (settings.value = changed))
    },
    { flush: 'sync' }
  )

  return { ...media, settings }
}
