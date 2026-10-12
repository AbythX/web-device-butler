import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'

import type { DeviceNetwork, NetworkConnection } from '../../../network/device-network.ts'

export interface UseNetwork {
  /** `false` if the device has no network; `undefined` where there is no browser, as during server-side rendering */
  readonly isOnline: Ref<boolean | undefined>
  /** what kind of connection the device has; `undefined` where the browser does not say */
  readonly connection: ShallowRef<NetworkConnection | undefined>
}

/**
 * Whether the device has a network, as reactive state.
 */
export const useNetwork = (network: DeviceNetwork): UseNetwork => {
  const isOnline = ref(network.isOnline)
  const connection = shallowRef(network.connection)

  const subscriptions = [
    network.on('change', (changed) => (isOnline.value = changed)),
    network.on('connectionchange', (changed) => (connection.value = changed)),
  ]

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => subscriptions.forEach((subscription) => subscription.unsubscribe()))
  }

  return { isOnline, connection }
}
