import '../core/disposable-polyfill.ts'

import type { DeviceEnvironment } from '../core/environment/device-environment.ts'
import { EventEmitter } from '../core/events/event-emitter.ts'
import type { Logger } from '../core/logging/logger.ts'
import type { DeviceOrientation, DeviceOrientationEvents, OrientationKind } from './device-orientation.ts'

/**
 * The implementation of {@link DeviceOrientation}.
 */
export class DefaultDeviceOrientation extends EventEmitter<DeviceOrientationEvents> implements DeviceOrientation {
  private static readonly portraitQuery = '(orientation: portrait)'

  private watched: MediaQueryList | undefined

  public constructor(
    private readonly environment: DeviceEnvironment,
    private readonly logger: Logger
  ) {
    super()
  }

  public get current(): OrientationKind | undefined {
    const portrait = this.query()

    if (portrait === undefined) {
      return undefined
    }

    return portrait.matches ? 'portrait' : 'landscape'
  }

  public get isPortrait(): boolean {
    return this.current === 'portrait'
  }

  public get isLandscape(): boolean {
    return this.current === 'landscape'
  }

  public dispose(): void {
    this.removeAllListeners()
    this.unwatch()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  protected override onFirstListener(): void {
    this.watched = this.query()
    this.watched?.addEventListener('change', this.changed)
  }

  protected override onLastListenerRemoved(): void {
    this.unwatch()
  }

  private readonly changed = (event: Pick<MediaQueryListEvent, 'matches'>): void => {
    this.emitSafely('change', event.matches ? 'portrait' : 'landscape', this.logger)
  }

  private unwatch(): void {
    this.watched?.removeEventListener('change', this.changed)
    this.watched = undefined
  }

  private query(): MediaQueryList | undefined {
    if (!this.environment.isBrowser) {
      return undefined
    }

    const { window } = this.environment

    return typeof window.matchMedia === 'function'
      ? window.matchMedia(DefaultDeviceOrientation.portraitQuery)
      : undefined
  }
}
