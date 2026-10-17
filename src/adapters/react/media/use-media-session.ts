import { useCallback, useEffect, useRef, useState } from 'react'

import type { MediaSession, MediaSessionEnd, MediaSessionState } from '../../../media/session/media-session.ts'

/**
 * What opens the sessions: the manager of the cameras, of the microphones or of the capture of the screen.
 */
export interface MediaSessionOpener<TSession, TRequirements> {
  open(requirements?: Partial<TRequirements>): Promise<TSession>
}

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
 * The session of a manager as state of a component. The session is closed when the component is unmounted.
 *
 * Shared by `useCamera`, `useMicrophone` and `useScreenCapture`.
 */
export const useMediaSession = <TSession extends MediaSession, TRequirements>(
  manager: MediaSessionOpener<TSession, TRequirements>
): UseMediaSession<TSession, TRequirements> => {
  const [session, setSession] = useState<TSession>()
  const [state, setState] = useState<MediaSessionState>()
  const [isOpening, setIsOpening] = useState(false)
  const [error, setError] = useState<unknown>()
  const [ended, setEnded] = useState<MediaSessionEnd>()

  /** the session that is open, also for the callbacks of a render that is over */
  const current = useRef<TSession | undefined>(undefined)
  const isMounted = useRef(true)
  const openings = useRef(0)
  /** calls of `open()` run one after another, so each one finds the session of the one before it */
  const turn = useRef<Promise<unknown>>(Promise.resolve())

  const close = useCallback(async (): Promise<void> => {
    await current.current?.close()
  }, [])

  const start = useCallback(
    async (requirements?: Partial<TRequirements>): Promise<TSession | undefined> => {
      try {
        if (!isMounted.current) {
          return undefined
        }

        await current.current?.close()
        const opened = await manager.open(requirements)

        // the component may have been unmounted while the device was starting
        if (!isMounted.current) {
          await opened.close()

          return undefined
        }

        opened.on('statechange', (changed) => {
          if (current.current === opened) {
            setState(changed)
          }
        })
        opened.on('ended', (end) => {
          if (current.current === opened) {
            current.current = undefined
            setSession(undefined)
            setState(undefined)
            setEnded(end)
          }
        })

        current.current = opened
        setSession(opened)
        setState(opened.state)

        return opened
      } catch (failure) {
        setError(failure)

        return undefined
      } finally {
        setIsOpening(--openings.current > 0)
      }
    },
    [manager]
  )

  const open = useCallback(
    (requirements?: Partial<TRequirements>): Promise<TSession | undefined> => {
      setError(undefined)
      setIsOpening(true)
      openings.current++

      const opening = turn.current.then(() => start(requirements))
      turn.current = opening

      return opening
    },
    [start]
  )

  useEffect(() => {
    isMounted.current = true

    return () => {
      isMounted.current = false
      void current.current?.close()
    }
  }, [])

  return { session, state, isOpening, error, ended, open, close }
}
