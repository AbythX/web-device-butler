import type { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import type { DevicePermissionState } from '../../permission/permission-state.ts'
import type { MicrophoneDescriptor } from './model/microphone-descriptor.ts'

/**
 * What `prepare()` found out about the microphones. It reports instead of throwing, so an application can go on
 * without a microphone.
 */
export interface MicrophonePreparation {
  readonly permission: DevicePermissionState
  /** every microphone that is known, with what was found out about it */
  readonly microphones: readonly MicrophoneDescriptor[]
  /** the microphone `open()` would start with the same requirements; `undefined` if none fits */
  readonly selected?: MicrophoneDescriptor
  /** why there is no selected microphone */
  readonly error?: DeviceButlerError
}
