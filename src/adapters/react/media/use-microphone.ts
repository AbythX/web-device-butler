import { useCallback, useEffect, useRef, useState } from 'react'

import type { MicrophoneManager } from '../../../media/microphone/microphone-manager.ts'
import type { MicrophoneRequirements } from '../../../media/microphone/model/microphone-requirements.ts'
import type { MicrophoneSettings } from '../../../media/microphone/model/microphone-settings.ts'
import type { MicrophoneSession } from '../../../media/microphone/session/microphone-session.ts'
import { useMediaSession, type UseMediaSession } from './use-media-session.ts'

export interface UseMicrophoneOptions {
  /**
   * Measure how loud the microphone is while a session runs. It costs an audio context, and the component renders
   * with every measurement. Default: `false`.
   */
  level?: boolean
}

export interface UseMicrophone extends UseMediaSession<MicrophoneSession, MicrophoneRequirements> {
  /** what the microphone delivers; follows `session.processing.set()` */
  readonly settings: MicrophoneSettings | undefined
  /** whether the application muted the microphone */
  readonly muted: boolean
  /** from `0` to `1`; stays `0` unless the `level` option is set */
  readonly level: number
  /** mutes and unmutes; a session that is opened later continues the way the last one was left */
  setMuted(muted: boolean): void
}

/**
 * A microphone session as state of a component. The session is closed when the component is unmounted.
 */
export const useMicrophone = (manager: MicrophoneManager, options: UseMicrophoneOptions = {}): UseMicrophone => {
  const media = useMediaSession(manager)
  const { session } = media
  const [settings, setSettings] = useState<MicrophoneSettings>()
  const [muted, setMutedState] = useState(false)
  const [level, setLevel] = useState(0)
  /** what the application asked for last, also before there was a session */
  const wanted = useRef(false)
  const measuresLevel = options.level === true

  useEffect(() => {
    setSettings(session?.settings)
    setLevel(0)

    if (session === undefined) {
      return undefined
    }

    // a new session continues the way the application left the last one
    session.muted = wanted.current

    const subscriptions = [
      session.on('settingschange', (changed) => setSettings(changed)),
      session.on('mutechange', (changed) => {
        wanted.current = changed
        setMutedState(changed)
      }),
      measuresLevel ? session.level?.on('change', (changed) => setLevel(changed)) : undefined,
    ]

    return () => subscriptions.forEach((subscription) => subscription?.unsubscribe())
  }, [session, measuresLevel])

  const setMuted = useCallback(
    (changed: boolean): void => {
      wanted.current = changed
      setMutedState(changed)

      if (session !== undefined) {
        session.muted = changed
      }
    },
    [session]
  )

  return { ...media, settings, muted, level, setMuted }
}
