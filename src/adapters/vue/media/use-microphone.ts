import { ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'

import type { MicrophoneManager } from '../../../media/microphone/microphone-manager.ts'
import type { MicrophoneRequirements } from '../../../media/microphone/model/microphone-requirements.ts'
import type { MicrophoneSettings } from '../../../media/microphone/model/microphone-settings.ts'
import type { MicrophoneSession } from '../../../media/microphone/session/microphone-session.ts'
import { useMediaSession, type UseMediaSession } from './use-media-session.ts'

export interface UseMicrophoneOptions {
  /** measure how loud the microphone is while a session runs, which costs an audio context; default: `false` */
  level?: boolean
}

export interface UseMicrophone extends UseMediaSession<MicrophoneSession, MicrophoneRequirements> {
  /** what the microphone delivers; follows `session.processing.set()` */
  readonly settings: ShallowRef<MicrophoneSettings | undefined>
  /** whether the application muted the microphone; assign to mute and unmute */
  readonly muted: Ref<boolean>
  /** from `0` to `1`; stays `0` unless the `level` option is set */
  readonly level: Ref<number>
}

/**
 * A microphone session as reactive state. The session is closed when the component is unmounted.
 */
export const useMicrophone = (manager: MicrophoneManager, options: UseMicrophoneOptions = {}): UseMicrophone => {
  const media = useMediaSession(manager)
  const settings = shallowRef<MicrophoneSettings>()
  const muted = ref(false)
  const level = ref(0)

  watch(
    media.session,
    (session) => {
      settings.value = session?.settings
      level.value = 0

      if (session === undefined) {
        return
      }

      // a new session continues the way the application left the last one
      session.muted = muted.value
      session.on('settingschange', (changed) => (settings.value = changed))
      session.on('mutechange', (changed) => (muted.value = changed))

      if (options.level) {
        session.level?.on('change', (changed) => (level.value = changed))
      }
    },
    { flush: 'sync' }
  )

  watch(
    muted,
    (changed) => {
      if (media.session.value !== undefined) {
        media.session.value.muted = changed
      }
    },
    { flush: 'sync' }
  )

  return { ...media, settings, muted, level }
}
