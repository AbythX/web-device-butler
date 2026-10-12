import '../core/disposable-polyfill.ts'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import type { Logger } from '../core/logging/logger.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import { DevicePosition } from './device-position.ts'
import { LocationErrorFactory } from './errors/location-error-factory.ts'
import type { CurrentLocationOptions, LocationConfiguration, LocationOptions } from './location-options.ts'
import { PositionSearch } from './position-search.ts'
import { DefaultLocationWatch } from './default-location-watch.ts'
import type { LocationWatch } from './location-watch.ts'
import type { DeviceLocation } from './device-location.ts'

/**
 * The implementation of {@link DeviceLocation}.
 */
export class DefaultDeviceLocation implements DeviceLocation {
  /**
   * For applications that only use the location. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    configuration: LocationConfiguration = {},
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): DeviceLocation {
    return new DefaultDeviceLocation(environment, logger, configuration)
  }

  private readonly watches = new Set<LocationWatch>()

  /**
   * @param configuration the defaults of every call
   */
  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger,
    private readonly configuration: LocationConfiguration = {}
  ) {}

  public get isSupported(): boolean {
    return this.environment.isSecureContext && this.environment.geolocation !== undefined
  }

  public async current(options: CurrentLocationOptions = {}): Promise<DevicePosition> {
    const geolocation = this.geolocation
    const { signal } = options
    const merged = this.merge(options)

    if (DefaultDeviceLocation.asksForTraits(merged)) {
      return this.search(geolocation, merged, signal)
    }

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
        { enableHighAccuracy: merged.highAccuracy, timeout: merged.timeout, maximumAge: merged.maximumAge }
      )
    })
  }

  public watch(options: LocationOptions = {}): LocationWatch {
    const watch = new DefaultLocationWatch(this.geolocation, this.merge(options), this.logger, (stopped) =>
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

  private static asksForTraits({ require = {}, prefer = {} }: LocationOptions): boolean {
    return [require, prefer].some((traits) =>
      Object.values(traits).some((value) => value !== undefined && value !== false)
    )
  }

  /**
   * The options of a call over the configured defaults. Fields that are not set do not replace anything.
   */
  private merge(options: LocationOptions): LocationOptions {
    const { require, prefer, highAccuracy, timeout, maximumAge } = this.configuration

    return {
      require: options.require ?? require,
      prefer: options.prefer ?? prefer,
      highAccuracy: options.highAccuracy ?? highAccuracy,
      timeout: options.timeout ?? timeout,
      maximumAge: options.maximumAge ?? maximumAge,
    }
  }

  /**
   * Follows the device until it reports the position the options ask for. The browser answers a single request
   * with the first position it has, which is often a coarse one, so the positions of a watch are looked through
   * instead and the library keeps the time itself.
   */
  private search(geolocation: Geolocation, options: LocationOptions, signal?: AbortSignal): Promise<DevicePosition> {
    const { require = {}, prefer = {}, timeout } = options
    const search = new PositionSearch(require, prefer, timeout !== undefined)

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason)

        return
      }

      let timer: ReturnType<typeof setTimeout> | undefined

      const finish = (settle: () => void) => {
        geolocation.clearWatch(identifier)
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        settle()
      }

      /** resolves with the best position that has what is required, or rejects with the given error */
      const conclude = (failure?: unknown) =>
        finish(() => {
          try {
            resolve(search.conclude())
          } catch (error) {
            reject(failure ?? error)
          }
        })

      const abort = () => finish(() => reject(signal?.reason))
      signal?.addEventListener('abort', abort, { once: true })

      const identifier = geolocation.watchPosition(
        (reported) => {
          const position = search.offer(DevicePosition.from(reported))

          if (position !== undefined) {
            finish(() => resolve(position))
          }
        },
        (error) => conclude(LocationErrorFactory.from(error)),
        { enableHighAccuracy: options.highAccuracy, maximumAge: options.maximumAge }
      )

      if (timeout !== undefined) {
        timer = setTimeout(() => conclude(), timeout)
      }
    })
  }

  private get geolocation(): Geolocation {
    const geolocation = this.environment.geolocation

    if (!this.isSupported || geolocation === undefined) {
      throw new UnsupportedError('geolocation')
    }

    return geolocation
  }
}
