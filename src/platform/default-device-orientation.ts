import '../core/disposable-polyfill.ts'

import type { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { BrowserError } from '../core/errors/browser-error.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import { EventEmitter } from '../core/events/event-emitter.ts'
import type { Logger } from '../core/logging/logger.ts'
import { ScreenError } from '../screen/errors/screen-error.ts'
import type { DeviceOrientation, DeviceOrientationEvents, OrientationKind } from './device-orientation.ts'

/**
 * The implementation of {@link DeviceOrientation}.
 */
export class DefaultDeviceOrientation extends EventEmitter<DeviceOrientationEvents> implements DeviceOrientation {
  private static readonly portraitQuery = '(orientation: portrait)'

  private watched: MediaQueryList | undefined

  public constructor(
    private readonly environment: BrowserEnvironment,
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

  public get canLock(): boolean {
    return typeof this.environment.screenOrientation?.lock === 'function'
  }

  public async lock(orientation: OrientationKind): Promise<void> {
    const screenOrientation = this.environment.screenOrientation

    if (screenOrientation === undefined || typeof screenOrientation.lock !== 'function') {
      throw new UnsupportedError('orientation lock')
    }

    try {
      await screenOrientation.lock(orientation)
    } catch (error) {
      // a device that cannot be turned, such as a desktop, has the call and rejects it
      throw BrowserError.hasName(error, 'NotSupportedError')
        ? new UnsupportedError('orientation lock', { cause: error })
        : new ScreenError(`The browser did not keep the page in ${orientation}`, { cause: error })
    }
  }

  public unlock(): void {
    try {
      this.environment.screenOrientation?.unlock?.()
    } catch (error) {
      this.logger.debug('Could not let the page turn again', error)
    }
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
