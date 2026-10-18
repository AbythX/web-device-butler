import { useEffect, useState } from 'react'

import type { DeviceNetwork, NetworkConnection } from '../../../network/device-network.ts'
import { useEventValue } from '../use-event-value.ts'

export interface UseNetwork {
  /** `false` if the device has no network; `undefined` where there is no browser, as during server-side rendering */
  readonly isOnline: boolean | undefined
  /** what kind of connection the device has; `undefined` where the browser does not say */
  readonly connection: NetworkConnection | undefined
}

/**
 * Whether the device has a network, as state of a component.
 */
export const useNetwork = (network: DeviceNetwork): UseNetwork => {
  const isOnline = useEventValue(network, 'change', () => network.isOnline, undefined)

  // every read of the connection is a new object, so it is kept as state and not read during a render
  const [connection, setConnection] = useState<NetworkConnection>()

  useEffect(() => {
    setConnection(network.connection)
    const subscription = network.on('connectionchange', (changed) => setConnection(changed))

    return () => subscription.unsubscribe()
  }, [network])

  return { isOnline, connection }
}
