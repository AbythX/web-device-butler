export { MediaAccess } from './access/media-access.ts'

export type {
  MediaAccessEvents,
  MediaAccessTiming,
  MediaAcquireOptions,
  MediaAvailability,
  MediaBusyPolicy,
} from './access/media-access.ts'

export { MediaAccessState } from './access/media-access-state.ts'

export type { MediaAccessScope, MediaAccessStatus, MediaKind } from './access/media-access-state.ts'

export { MediaLease } from './access/media-lease.ts'

export type { MediaOpenRequest } from './access/media-lease.ts'

export { MediaPermissionRequester } from './access/media-permission-requester.ts'

export type {
  CombinedMediaSession,
  CombinedMediaSessionEnd,
  CombinedMediaSessionEvents,
} from './combined/combined-media-session.ts'

export { DefaultCombinedMediaSession } from './combined/default-combined-media-session.ts'

export type { CombinedMediaRequirements, MediaManager } from './combined/media-manager.ts'

export { DefaultMediaManager } from './combined/default-media-manager.ts'

export { MediaDeviceBusyError } from './errors/media-device-busy-error.ts'

export type { MediaDeviceHolder } from './errors/media-device-busy-error.ts'

export { MediaDeviceNotFoundError } from './errors/media-device-not-found-error.ts'

export { MediaError } from './errors/media-error.ts'

export { MediaRequirementsError } from './errors/media-requirements-error.ts'

export { SessionClosedError } from './errors/session-closed-error.ts'

export { MediaInputDescriptor } from './input/media-input-descriptor.ts'

export type { MediaInputDetail } from './input/media-input-descriptor.ts'

export type {
  MediaInputManager,
  MediaInputManagerEvents,
  MediaInputPreparation,
  MediaInputStart,
} from './input/media-input-manager.ts'

export { BaseMediaInputManager } from './input/base-media-input-manager.ts'

export type { MediaInputRequirements } from './input/media-input-requirements.ts'

export { MediaInputSelection } from './input/media-input-selection.ts'

export type { MediaInputRejection } from './input/media-input-selection.ts'

export { IosTorchResetsOnZoomQuirk } from './quirks/ios-torch-resets-on-zoom-quirk.ts'

export { PlatformQuirk } from './quirks/platform-quirk.ts'

export type { ConstraintChange } from './quirks/platform-quirk.ts'

export { PlatformQuirks } from './quirks/platform-quirks.ts'

export { ConstraintQueue } from './session/constraint-queue.ts'

export type {
  MediaSession,
  MediaSessionEnd,
  MediaSessionEndReason,
  MediaSessionEvents,
  MediaSessionState,
} from './session/media-session.ts'

export { BaseMediaSession } from './session/base-media-session.ts'

export type {
  TrackCapabilities,
  TrackConstraintSet,
  TrackConstraints,
  TrackSettings,
} from './session/track-constraints.ts'

export { TrackControl } from './session/track-control.ts'
