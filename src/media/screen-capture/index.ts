export type { ScreenCaptureManager } from './screen-capture-manager.ts'

export { DefaultScreenCaptureManager } from './default-screen-capture-manager.ts'

export type {
  DisplaySurface,
  ScreenCaptureConfiguration,
  ScreenCaptureContent,
  ScreenCaptureFocus,
  ScreenCaptureRequirements,
  ScreenCaptureTraits,
} from './model/screen-capture-requirements.ts'

export { ScreenCaptureSettings } from './model/screen-capture-settings.ts'

export type {
  ScreenCaptureChanges,
  ScreenCaptureSession,
  ScreenCaptureSessionEvents,
} from './session/screen-capture-session.ts'

export { DefaultScreenCaptureSession } from './session/default-screen-capture-session.ts'

export type { ScreenCaptureTiming } from './session/screen-capture-timing.ts'

export { ScreenCaptureConstraints } from './session/screen-capture-constraints.ts'

export { StreamHold } from './session/stream-hold.ts'
