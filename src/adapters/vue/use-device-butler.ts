import { inject, provide, type InjectionKey } from 'vue'

import type { DeviceButler } from '../../core/device-butler.ts'

const deviceButlerKey: InjectionKey<DeviceButler> = Symbol.for('web-device-butler:device-butler')

/**
 * Makes a butler available to the components below the calling one. The application creates and disposes it.
 */
export const provideDeviceButler = (butler: DeviceButler): void => {
  provide(deviceButlerKey, butler)
}

/**
 * The butler that a component further up provided. With `app.provide(deviceButlerInjectionKey, butler)` it is available
 * everywhere.
 *
 * @throws Error if no butler was provided
 */
export const useDeviceButler = (): DeviceButler => {
  const butler = inject(deviceButlerKey)

  if (butler === undefined) {
    throw new Error(
      'No butler was provided: call provideDeviceButler(butler) or app.provide(deviceButlerInjectionKey, butler)'
    )
  }

  return butler
}

export { deviceButlerKey as deviceButlerInjectionKey }
