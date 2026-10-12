import type { Listenable } from '../core/events/listenable.ts'

/**
 * What the browser says about the connection of the device. Only some browsers say anything, and each of them only a
 * part, so every field can be missing.
 */
export interface NetworkConnection {
  /** what the device is connected through: `wifi`, `cellular`, `ethernet`, `none`, ... */
  readonly type?: string
  /** how fast the connection has been lately, as the browser classifies it: `slow-2g`, `2g`, `3g` or `4g` */
  readonly effectiveType?: string
  /** the estimated speed towards the device, in megabits per second */
  readonly downlink?: number
  /** the estimated time of a round trip, in milliseconds */
  readonly roundTripTime?: number
  /** whether the user asked the browser to use less data */
  readonly saveData?: boolean
}

export interface DeviceNetworkEvents {
  /** the device got a network or lost it; the payload is the new `isOnline` */
  change: boolean
  /** the browser reports another kind or speed of connection */
  connectionchange: NetworkConnection
}

/**
 * Whether the device has a network (`butler.network`), as far as the browser can tell.
 *
 * A browser knows whether the device is connected to a network, not whether that network reaches the internet: a
 * phone in a wifi that asks for a login first counts as online. `isOnline === false` is reliable, `true` is a hint;
 * a request that succeeds is the only proof.
 */
export interface DeviceNetwork extends Listenable<DeviceNetworkEvents>, Disposable {
  /**
   * `false` if the device has no network. `undefined` where there is no browser, as during server-side rendering.
   */
  readonly isOnline: boolean | undefined

  /**
   * What kind of connection the device has. `undefined` where the browser does not say.
   */
  readonly connection: NetworkConnection | undefined

  /**
   * Stops watching and forgets every listener.
   */
  dispose(): void
}
