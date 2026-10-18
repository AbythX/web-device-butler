import type { PermissionPreparation } from '../../permission/permission-preparation.ts'
import type { MicrophoneDescriptor } from './model/microphone-descriptor.ts'

/**
 * What `prepare()` found out about the microphones. It reports instead of throwing, so an application can go on
 * without a microphone.
 */
export interface MicrophonePreparation extends PermissionPreparation {
  /** every microphone that is known, with what was found out about it */
  readonly microphones: readonly MicrophoneDescriptor[]
  /** the microphone `open()` would start with the same requirements; `undefined` if none fits */
  readonly selected?: MicrophoneDescriptor
}
