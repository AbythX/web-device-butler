import type { CameraConfiguration } from '../media/camera/model/camera-requirements.ts'
import type { MicrophoneConfiguration } from '../media/microphone/model/microphone-requirements.ts'
import type { StorageConfiguration } from '../storage/storage-configuration.ts'
import type { Logger } from './logging/logger.ts'

/**
 * What an application passes to `DefaultDevice.create()`. Plain data; every area of the library adds its own section.
 */
export interface DeviceConfiguration {
  /** receives the log output of the library, which is silent without it */
  logger?: Logger
  storage?: StorageConfiguration
  /** the defaults of every call of `device.camera`; `device.camera.configure()` changes them later */
  camera?: CameraConfiguration
  /** the defaults of every call of `device.microphone`; `device.microphone.configure()` changes them later */
  microphone?: MicrophoneConfiguration
}
