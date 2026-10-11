import '../core/disposable-polyfill.ts'

import { EventEmitter } from '../core/events/event-emitter.ts'
import type { Logger } from '../core/logging/logger.ts'
import { PermissionDeniedError } from '../permission/errors/permission-denied-error.ts'
import { DevicePosition } from './device-position.ts'
import { LocationErrorFactory } from './errors/location-error-factory.ts'
import type { LocationOptions } from './location-options.ts'
import type { LocationWatch, LocationWatchEvents } from './location-watch.ts'

/**
 * The implementation of {@link LocationWatch}.
 */
export class DefaultLocationWatch extends EventEmitter<LocationWatchEvents> implements LocationWatch {
  private identifier: number | undefined
  private lastPosition: DevicePosition | undefined

  /**
   * @param stopped called once, when the watch has stopped
   */
  public constructor(
    private readonly geolocation: Geolocation,
    options: LocationOptions,
    private readonly logger: Logger,
    private readonly stopped: (watch: LocationWatch) => void = () => undefined
  ) {
    super()

    this.identifier = geolocation.watchPosition(
      (position) => this.moved(position),
      (error) => this.failed(error),
      { enableHighAccuracy: options.highAccuracy, timeout: options.timeout, maximumAge: options.maximumAge }
    )
  }

  public get isActive(): boolean {
    return this.identifier !== undefined
  }

  public get position(): DevicePosition | undefined {
    return this.lastPosition
  }

  public stop(): void {
    if (this.deactivate()) {
      this.removeAllListeners()
    }
  }

  /**
   * Calls {@link stop}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.stop()
  }

  private moved(position: GeolocationPosition): void {
    if (!this.isActive) {
      return
    }

    this.lastPosition = DevicePosition.from(position)
    this.emitSafely('position', this.lastPosition, this.logger)
  }

  private failed(error: GeolocationPositionError): void {
    if (!this.isActive) {
      return
    }

    const mapped = LocationErrorFactory.from(error)
    // a refusal is final, nothing arrives after it; the listeners find the watch stopped already
    const isFinal = mapped instanceof PermissionDeniedError && this.deactivate()

    this.emitSafely('error', mapped, this.logger)

    if (isFinal) {
      this.removeAllListeners()
    }
  }

  /**
   * @returns `false` if the watch was not active
   */
  private deactivate(): boolean {
    if (this.identifier === undefined) {
      return false
    }

    this.geolocation.clearWatch(this.identifier)
    this.identifier = undefined
    this.stopped(this)

    return true
  }
}
