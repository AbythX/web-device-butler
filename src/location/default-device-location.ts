import '../core/disposable-polyfill.ts'

import { DeviceEnvironment } from '../core/environment/device-environment.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import type { Logger } from '../core/logging/logger.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import { DevicePosition } from './device-position.ts'
import { LocationErrorFactory } from './errors/location-error-factory.ts'
import type { CurrentLocationOptions, LocationOptions } from './location-options.ts'
import { DefaultLocationWatch } from './default-location-watch.ts'
import type { LocationWatch } from './location-watch.ts'
import type { DeviceLocation } from './device-location.ts'

/**
 * The implementation of {@link DeviceLocation}.
 */
export class DefaultDeviceLocation implements DeviceLocation {
  /**
   * For applications that only use the location. Otherwise it is reached through `Device`.
   */
  public static create(
    environment: DeviceEnvironment = DeviceEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): DeviceLocation {
    return new DefaultDeviceLocation(environment, logger)
  }

  private readonly watches = new Set<LocationWatch>()

  public constructor(
    private readonly environment: DeviceEnvironment,
    private readonly logger: Logger
  ) {}

  public get isSupported(): boolean {
    return this.environment.isSecureContext && this.environment.geolocation !== undefined
  }

  public async current(options: CurrentLocationOptions = {}): Promise<DevicePosition> {
    const geolocation = this.geolocation
    const { signal } = options

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason)

        return
      }

      // the browser cannot be told to stop, so its answer is ignored after the call was aborted
      const abort = () => reject(signal?.reason)
      signal?.addEventListener('abort', abort, { once: true })

      geolocation.getCurrentPosition(
        (position) => {
          signal?.removeEventListener('abort', abort)
          resolve(DevicePosition.from(position))
        },
        (error) => {
          signal?.removeEventListener('abort', abort)
          reject(LocationErrorFactory.from(error))
        },
        { enableHighAccuracy: options.highAccuracy, timeout: options.timeout, maximumAge: options.maximumAge }
      )
    })
  }

  public watch(options: LocationOptions = {}): LocationWatch {
    const watch = new DefaultLocationWatch(this.geolocation, options, this.logger, (stopped) =>
      this.watches.delete(stopped)
    )

    this.watches.add(watch)

    return watch
  }

  public dispose(): void {
    for (const watch of [...this.watches]) {
      watch.stop()
    }
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  private get geolocation(): Geolocation {
    const geolocation = this.environment.geolocation

    if (!this.isSupported || geolocation === undefined) {
      throw new UnsupportedError('geolocation')
    }

    return geolocation
  }
}
