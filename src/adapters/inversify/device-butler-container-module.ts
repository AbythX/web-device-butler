import { ContainerModule } from 'inversify'

import type { DeviceButler } from '../../core/device-butler.ts'
import { DeviceButlerBindings } from './device-butler-bindings.ts'

/**
 * Binds a butler and each of its parts in an inversify container.
 *
 * ```ts
 * const butler = DefaultDeviceButler.create(configuration)
 * container.load(new DeviceButlerContainerModule(butler))
 * container.get(DeviceButlerBindings.Camera).open()
 * ```
 *
 * The application creates the butler and disposes it; the container only hands it out.
 */
export class DeviceButlerContainerModule extends ContainerModule {
  public constructor(butler: DeviceButler) {
    super(({ bind }) => {
      bind(DeviceButlerBindings.DeviceButler).toConstantValue(butler)
      bind(DeviceButlerBindings.Storage).toConstantValue(butler.storage)
      bind(DeviceButlerBindings.Camera).toConstantValue(butler.camera)
      bind(DeviceButlerBindings.Microphone).toConstantValue(butler.microphone)
      bind(DeviceButlerBindings.Media).toConstantValue(butler.media)
      bind(DeviceButlerBindings.ScreenCapture).toConstantValue(butler.screenCapture)
      bind(DeviceButlerBindings.Permission).toConstantValue(butler.permission)
      bind(DeviceButlerBindings.Coordination).toConstantValue(butler.coordination)
      bind(DeviceButlerBindings.Location).toConstantValue(butler.location)
      bind(DeviceButlerBindings.Platform).toConstantValue(butler.platform)
      bind(DeviceButlerBindings.Orientation).toConstantValue(butler.orientation)
      bind(DeviceButlerBindings.Motion).toConstantValue(butler.motion)
      bind(DeviceButlerBindings.Page).toConstantValue(butler.page)
      bind(DeviceButlerBindings.Recorder).toConstantValue(butler.recorder)
      bind(DeviceButlerBindings.Scanner).toConstantValue(butler.scanner)
      bind(DeviceButlerBindings.AudioOutput).toConstantValue(butler.audioOutput)
      bind(DeviceButlerBindings.Network).toConstantValue(butler.network)
      bind(DeviceButlerBindings.WakeLock).toConstantValue(butler.wakeLock)
      bind(DeviceButlerBindings.Fullscreen).toConstantValue(butler.fullscreen)
      bind(DeviceButlerBindings.Share).toConstantValue(butler.share)
      bind(DeviceButlerBindings.Clipboard).toConstantValue(butler.clipboard)
      bind(DeviceButlerBindings.Files).toConstantValue(butler.files)
      bind(DeviceButlerBindings.Outbox).toConstantValue(butler.outbox)
    })
  }
}
