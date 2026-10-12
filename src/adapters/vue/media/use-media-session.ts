import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'

import type { MediaInputDescriptor } from '../../../media/input/media-input-descriptor.ts'
import type { MediaInputManager } from '../../../media/input/media-input-manager.ts'
import type { MediaInputRequirements } from '../../../media/input/media-input-requirements.ts'
import type { MediaSession, MediaSessionEnd, MediaSessionState } from '../../../media/session/media-session.ts'

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
 * The session of a manager as reactive state. The session is closed when the component is unmounted.
 *
 * Shared by `useCamera` and `useMicrophone`.
 */
export const useMediaSession = <
  TDescriptor extends MediaInputDescriptor,
  TSession extends MediaSession,
  TRequirements extends MediaInputRequirements,
>(
  manager: MediaInputManager<TDescriptor, TSession, TRequirements>
): UseMediaSession<TSession, TRequirements> => {
  const session = shallowRef<TSession>()
  const state = ref<MediaSessionState>()
  const isOpening = ref(false)
  const error = shallowRef<unknown>()
  const ended = shallowRef<MediaSessionEnd>()

  let isDisposed = false
  let openings = 0
  /** calls of `open()` run one after another, so each one finds the session of the one before it */
  let turn: Promise<unknown> = Promise.resolve()

  const close = async (): Promise<void> => {
    await session.value?.close()
  }

  const start = async (requirements?: Partial<TRequirements>): Promise<TSession | undefined> => {
    try {
      if (isDisposed) {
        return undefined
      }

      await close()
      const opened = await manager.open(requirements)

      // the component may have been unmounted while the device was starting
      if (isDisposed) {
        await opened.close()

        return undefined
      }

      opened.on('statechange', (changed) => {
        if (session.value === opened) {
          state.value = changed
        }
      })
      opened.on('ended', (end) => {
        if (session.value === opened) {
          session.value = undefined
          state.value = undefined
          ended.value = end
        }
      })

      session.value = opened
      state.value = opened.state

      return opened
    } catch (failure) {
      error.value = failure

      return undefined
    } finally {
      isOpening.value = --openings > 0
    }
  }

  const open = (requirements?: Partial<TRequirements>): Promise<TSession | undefined> => {
    error.value = undefined
    isOpening.value = true
    openings++

    const opening = turn.then(() => start(requirements))
    turn = opening

    return opening
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      isDisposed = true
      void close()
    })
  }

  return { session, state, isOpening, error, ended, open, close }
}
