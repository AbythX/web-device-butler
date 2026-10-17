import type { LocationConfiguration } from '../location/location-options.ts'
import type { CameraConfiguration } from '../media/camera/model/camera-requirements.ts'
import type { MicrophoneConfiguration } from '../media/microphone/model/microphone-requirements.ts'
import type { CodeScannerConfiguration } from '../media/scanning/code-scanner.ts'
import type { ScreenCaptureConfiguration } from '../media/screen-capture/model/screen-capture-requirements.ts'
import type { StorageConfiguration } from '../storage/storage-configuration.ts'
import type { Logger } from './logging/logger.ts'

/**
 * What an application passes to `DefaultDeviceButler.create()`. Plain data; every area of the library adds its own section.
 */
export interface DeviceButlerConfiguration {
  /** receives the log output of the library, which is silent without it */
  logger?: Logger
  /** the prefix of every store, and the defaults of the backend every `butler.storage.open()` chooses */
  storage?: StorageConfiguration
  /** the defaults of every call of `butler.location` */
  location?: LocationConfiguration
  /** the defaults of every call of `butler.camera`; `butler.camera.configure()` changes them later */
  camera?: CameraConfiguration
  /** the defaults of every call of `butler.microphone`; `butler.microphone.configure()` changes them later */
  microphone?: MicrophoneConfiguration
  /** the defaults of every call of `butler.screenCapture`; `butler.screenCapture.configure()` changes them later */
  screenCapture?: ScreenCaptureConfiguration
  /** the decoder and the defaults of every scan and every `butler.scanner.detect()` */
  scanner?: CodeScannerConfiguration
}
