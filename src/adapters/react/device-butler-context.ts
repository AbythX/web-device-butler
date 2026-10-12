import { createContext, useContext, type Context } from 'react'

import type { DeviceButler } from '../../core/device-butler.ts'

/**
 * Makes a butler available to the components below: `<DeviceButlerContext value={butler}>`, or
 * `<DeviceButlerContext.Provider value={butler}>` before React 19. The application creates and disposes the butler.
 */
export const DeviceButlerContext: Context<DeviceButler | undefined> = createContext<DeviceButler | undefined>(undefined)

/**
 * The butler that a component further up provided through {@link DeviceButlerContext}.
 *
 * @throws Error if no butler was provided
 */
export const useDeviceButler = (): DeviceButler => {
  const butler = useContext(DeviceButlerContext)

  if (butler === undefined) {
    throw new Error('No butler was provided: render <DeviceButlerContext value={butler}> above this component')
  }

  return butler
}
