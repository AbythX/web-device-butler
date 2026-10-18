import type { ScreenCaptureRequirements } from '../../../media/screen-capture/model/screen-capture-requirements.ts'
import type { ScreenCaptureManager } from '../../../media/screen-capture/screen-capture-manager.ts'
import type { ScreenCaptureSession } from '../../../media/screen-capture/session/screen-capture-session.ts'
import { ScreenCaptureController, type ScreenCaptureSnapshot } from '../../state/media/screen-capture-controller.ts'
import type { SnapshotRefs } from '../use-controller.ts'
import { bindMediaSession, type UseMediaSession } from './use-media-session.ts'

export interface UseScreenCapture
  extends UseMediaSession<ScreenCaptureSession, ScreenCaptureRequirements>, SnapshotRefs<ScreenCaptureSnapshot> {}

/**
 * A capture of the screen as reactive state: `open()` it from a click handler, bind `session.value?.stream` to a
 * video element. `ended` says `device` when the user stopped sharing. The capture is stopped when the component is
 * unmounted.
 */
export const useScreenCapture = (manager: ScreenCaptureManager): UseScreenCapture =>
  bindMediaSession(new ScreenCaptureController(() => manager))
