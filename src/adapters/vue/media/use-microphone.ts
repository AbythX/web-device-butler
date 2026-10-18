import { watch, type Ref, type ShallowRef } from 'vue'

import type { MicrophoneManager } from '../../../media/microphone/microphone-manager.ts'
import type { MicrophoneRequirements } from '../../../media/microphone/model/microphone-requirements.ts'
import type { MicrophoneSettings } from '../../../media/microphone/model/microphone-settings.ts'
import type { MicrophoneSession } from '../../../media/microphone/session/microphone-session.ts'
import { MicrophoneController } from '../../state/media/microphone-controller.ts'
import { bindMediaSession, type UseMediaSession } from './use-media-session.ts'

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
  const controller = new MicrophoneController(() => manager, options.level === true)
  const microphone = bindMediaSession(controller)

  // the application mutes by assigning the ref
  watch(microphone.muted, (muted) => controller.setMuted(muted), { flush: 'sync' })

  return microphone
}
