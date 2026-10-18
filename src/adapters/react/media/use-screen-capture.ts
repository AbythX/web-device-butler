import type { ScreenCaptureRequirements } from '../../../media/screen-capture/model/screen-capture-requirements.ts'
import type { ScreenCaptureSettings } from '../../../media/screen-capture/model/screen-capture-settings.ts'
import type { ScreenCaptureManager } from '../../../media/screen-capture/screen-capture-manager.ts'
import type { ScreenCaptureSession } from '../../../media/screen-capture/session/screen-capture-session.ts'
import { ScreenCaptureController } from '../../state/media/screen-capture-controller.ts'
import { useLatest } from '../use-controller.ts'
import { useMediaSessionOf, type UseMediaSession } from './use-media-session.ts'

export interface UseScreenCapture extends UseMediaSession<ScreenCaptureSession, ScreenCaptureRequirements> {
  /** what the capture delivers, and what the user chose to share; follows a shared window that is resized */
  readonly settings: ScreenCaptureSettings | undefined
}

/**
 * A capture of the screen as state of a component: `open()` it from a click handler, give `session?.stream` to a
 * video element. `ended` says `device` when the user stopped sharing. The capture is stopped when the component is
 * unmounted.
 */
export const useScreenCapture = (manager: ScreenCaptureManager): UseScreenCapture => {
  const latest = useLatest(manager)
  const [capture] = useMediaSessionOf(() => new ScreenCaptureController(() => latest.current))

  return capture
}
