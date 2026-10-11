import { inject, provide, type InjectionKey } from 'vue'

import type { Device } from '../../core/device.ts'

const deviceKey: InjectionKey<Device> = Symbol.for('web-device-butler:device')

/**
 * Makes a device available to the components below the calling one. The application creates and disposes it.
 */
export const provideDevice = (device: Device): void => {
  provide(deviceKey, device)
}

/**
 * The device that a component further up provided. With `app.provide(deviceInjectionKey, device)` it is available
 * everywhere.
 *
 * @throws Error if no device was provided
 */
export const useDevice = (): Device => {
  const device = inject(deviceKey)

  if (device === undefined) {
    throw new Error('No device was provided: call provideDevice(device) or app.provide(deviceInjectionKey, device)')
  }

  return device
}

export { deviceKey as deviceInjectionKey }
