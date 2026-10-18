import type { MediaSession, MediaSessionEnd, MediaSessionState } from '../../../media/session/media-session.ts'
import {
  MediaSessionController,
  type MediaSessionOpener,
  type MediaSessionSnapshot,
} from '../../state/media/media-session-controller.ts'
import { useController, useLatest, useSnapshot } from '../use-controller.ts'

export type { MediaSessionOpener } from '../../state/media/media-session-controller.ts'

export interface UseMediaSession<TSession, TRequirements> {
  /** the open session; `undefined` before `open()` and after the session ended */
  readonly session: TSession | undefined
  /** `undefined` while there is no session */
  readonly state: MediaSessionState | undefined
  /** `true` between the call of `open()` and its outcome */
  readonly isOpening: boolean
  /** why the last `open()` failed; cleared by the next one */
  readonly error: unknown
  /** why the last session ended */
  readonly ended: MediaSessionEnd | undefined
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
 * The session of a controller as state of a component. Shared by `useMediaSession` and the hooks that follow more of
 * the session.
 */
export const useMediaSessionOf = <
  TSession extends MediaSession,
  TRequirements,
  Snapshot extends MediaSessionSnapshot<TSession>,
>(
  create: () => MediaSessionController<TSession, TRequirements, Snapshot>
): [Snapshot & UseMediaSession<TSession, TRequirements>, MediaSessionController<TSession, TRequirements, Snapshot>] => {
  const controller = useController(create)
  const snapshot = useSnapshot(controller)

  return [{ ...snapshot, open: controller.open, close: controller.close }, controller]
}

/**
 * The session of a manager as state of a component. The session is closed when the component is unmounted.
 *
 * Shared by `useCamera`, `useMicrophone` and `useScreenCapture`.
 */
export const useMediaSession = <TSession extends MediaSession, TRequirements>(
  manager: MediaSessionOpener<TSession, TRequirements>
): UseMediaSession<TSession, TRequirements> => {
  const latest = useLatest(manager)
  const [media] = useMediaSessionOf(() => new MediaSessionController<TSession, TRequirements>(() => latest.current, {}))

  return media
}
