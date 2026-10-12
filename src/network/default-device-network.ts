import '../core/disposable-polyfill.ts'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import type { NetworkInformationLike } from '../core/environment/network-information-like.ts'
import { EventEmitter } from '../core/events/event-emitter.ts'
import type { Logger } from '../core/logging/logger.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import type { DeviceNetwork, DeviceNetworkEvents, NetworkConnection } from './device-network.ts'

/**
 * The implementation of {@link DeviceNetwork}.
 */
export class DefaultDeviceNetwork extends EventEmitter<DeviceNetworkEvents> implements DeviceNetwork {
  /**
   * For applications that only use the network. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): DeviceNetwork {
    return new DefaultDeviceNetwork(environment, logger)
  }

  private watchedWindow: Window | undefined
  private watchedConnection: NetworkInformationLike | undefined

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {
    super()
  }

  public get isOnline(): boolean | undefined {
    return this.environment.isOnline
  }

  public get connection(): NetworkConnection | undefined {
    const information = this.environment.connection

    return information === undefined ? undefined : DefaultDeviceNetwork.describe(information)
  }

  public dispose(): void {
    this.removeAllListeners()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  protected override onFirstListener(type: keyof DeviceNetworkEvents): void {
    if (type === 'change') {
      this.watchedWindow = this.environment.isBrowser ? this.environment.window : undefined
      this.watchedWindow?.addEventListener('online', this.changed)
      this.watchedWindow?.addEventListener('offline', this.changed)
    } else {
      this.watchedConnection = this.environment.connection
      this.watchedConnection?.addEventListener?.('change', this.connectionChanged)
    }
  }

  protected override onLastListenerRemoved(type: keyof DeviceNetworkEvents): void {
    if (type === 'change') {
      this.watchedWindow?.removeEventListener('online', this.changed)
      this.watchedWindow?.removeEventListener('offline', this.changed)
      this.watchedWindow = undefined
    } else {
      this.watchedConnection?.removeEventListener?.('change', this.connectionChanged)
      this.watchedConnection = undefined
    }
  }

  private readonly changed = (): void => {
    const isOnline = this.isOnline

    if (isOnline !== undefined) {
      this.emitSafely('change', isOnline, this.logger)
    }
  }

  private readonly connectionChanged = (): void => {
    const connection = this.connection

    if (connection !== undefined) {
      this.emitSafely('connectionchange', connection, this.logger)
    }
  }

  /**
   * Only what has the type the specification gives it: a browser that reports something else reports nothing.
   */
  private static describe(information: NetworkInformationLike): NetworkConnection {
    const { type, effectiveType, downlink, rtt, saveData } = information

    return {
      type: typeof type === 'string' ? type : undefined,
      effectiveType: typeof effectiveType === 'string' ? effectiveType : undefined,
      downlink: typeof downlink === 'number' ? downlink : undefined,
      roundTripTime: typeof rtt === 'number' ? rtt : undefined,
      saveData: typeof saveData === 'boolean' ? saveData : undefined,
    }
  }
}
