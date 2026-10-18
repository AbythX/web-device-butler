import type { Ref, ShallowRef } from 'vue'

import type { MediaSession, MediaSessionEnd, MediaSessionState } from '../../../media/session/media-session.ts'
import {
  MediaSessionController,
  type MediaSessionOpener,
  type MediaSessionSnapshot,
} from '../../state/media/media-session-controller.ts'
import { type SnapshotRefs, useController } from '../use-controller.ts'

export type { MediaSessionOpener } from '../../state/media/media-session-controller.ts'

export interface UseMediaSession<TSession, TRequirements> {
  /** the open session; `undefined` before `open()` and after the session ended */
  readonly session: ShallowRef<TSession | undefined>
  /** `undefined` while there is no session */
  readonly state: Ref<MediaSessionState | undefined>
  /** `true` between the call of `open()` and its outcome */
  readonly isOpening: Ref<boolean>
  /** why the last `open()` failed; cleared by the next one */
  readonly error: ShallowRef<unknown>
  /** why the last session ended */
  readonly ended: ShallowRef<MediaSessionEnd | undefined>
  /**
   * Opens a session, after closing the one that is open. A failure is not thrown, it ends up in `error`.
   *
   * @returns the session, or `undefined` if it could not be opened
   */
  open(requirements?: Partial<TRequirements>): Promise<TSession | undefined>
  /**
   * Closes the session that is open, if there is one.
   */
  close(): Promise<void>
}

/**
 * The session of a controller as reactive state. Shared by `useMediaSession` and the composables that follow more of
 * the session.
 */
export const bindMediaSession = <
  TSession extends MediaSession,
  TRequirements,
  Snapshot extends MediaSessionSnapshot<TSession>,
>(
  controller: MediaSessionController<TSession, TRequirements, Snapshot>
): UseMediaSession<TSession, TRequirements> & SnapshotRefs<Snapshot> => ({
  ...useController(controller),
  open: controller.open,
  close: controller.close,
})

/**
 * The session of a manager as reactive state. The session is closed when the component is unmounted.
 *
 * Shared by `useCamera`, `useMicrophone` and `useScreenCapture`.
 */
export const useMediaSession = <TSession extends MediaSession, TRequirements>(
  manager: MediaSessionOpener<TSession, TRequirements>
): UseMediaSession<TSession, TRequirements> =>
  bindMediaSession(new MediaSessionController<TSession, TRequirements>(() => manager, {}))
