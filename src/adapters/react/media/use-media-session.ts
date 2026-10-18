import type { MediaSession } from '../../../media/session/media-session.ts'
import {
  MediaSessionController,
  type MediaSessionOpener,
  type MediaSessionSnapshot,
} from '../../state/media/media-session-controller.ts'
import { useController, useLatest, useSnapshot } from '../use-controller.ts'

export type { MediaSessionOpener } from '../../state/media/media-session-controller.ts'

export interface UseMediaSession<TSession, TRequirements> extends MediaSessionSnapshot<TSession> {
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
 * What every controller of a session is, whatever it follows besides.
 */
type SessionController = MediaSessionController<MediaSession, never, MediaSessionSnapshot<MediaSession>>

/**
 * The session of a controller as state of a component. Shared by `useMediaSession` and the hooks that follow more of
 * the session.
 *
 * @returns the state with `open()` and `close()`, and the controller for what a hook adds
 */
export const useMediaSessionOf = <Controller extends SessionController>(
  create: () => Controller
): [ReturnType<Controller['read']> & Pick<Controller, 'open' | 'close'>, Controller] => {
  const controller = useController(create)
  // SAFETY: the snapshot of a controller is what its read() returns
  const snapshot = useSnapshot(controller) as ReturnType<Controller['read']>

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
