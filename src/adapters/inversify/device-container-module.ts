import { ContainerModule } from 'inversify'

import type { Device } from '../../core/device.ts'
import { DeviceBindings } from './device-bindings.ts'

/**
 * Binds a device and each of its parts in an inversify container.
 *
 * ```ts
 * const device = DefaultDevice.create(configuration)
 * container.load(new DeviceContainerModule(device))
 * container.get(DeviceBindings.Camera).open()
 * ```
 *
 * The application creates the device and disposes it; the container only hands it out.
 */
export class DeviceContainerModule extends ContainerModule {
  public constructor(device: Device) {
    super((bind) => {
      bind(DeviceBindings.Device).toConstantValue(device)
      bind(DeviceBindings.Storage).toConstantValue(device.storage)
      bind(DeviceBindings.Camera).toConstantValue(device.camera)
      bind(DeviceBindings.Microphone).toConstantValue(device.microphone)
      bind(DeviceBindings.Media).toConstantValue(device.media)
      bind(DeviceBindings.Permission).toConstantValue(device.permission)
      bind(DeviceBindings.Coordination).toConstantValue(device.coordination)
      bind(DeviceBindings.Location).toConstantValue(device.location)
      bind(DeviceBindings.Platform).toConstantValue(device.platform)
      bind(DeviceBindings.Orientation).toConstantValue(device.orientation)
    })
  }
}
