import { useEffect } from 'react'

import type { MicrophoneManager } from '../../../media/microphone/microphone-manager.ts'
import type { MicrophoneRequirements } from '../../../media/microphone/model/microphone-requirements.ts'
import type { MicrophoneSettings } from '../../../media/microphone/model/microphone-settings.ts'
import type { MicrophoneSession } from '../../../media/microphone/session/microphone-session.ts'
import { MicrophoneController } from '../../state/media/microphone-controller.ts'
import { useLatest } from '../use-controller.ts'
import { useMediaSessionOf, type UseMediaSession } from './use-media-session.ts'

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
  const latest = useLatest(manager)
  const measuresLevel = options.level === true

  const [microphone, controller] = useMediaSessionOf(
    () => new MicrophoneController(() => latest.current, measuresLevel)
  )

  useEffect(() => controller.setMeasuresLevel(measuresLevel), [controller, measuresLevel])

  return { ...microphone, setMuted: controller.setMuted }
}
