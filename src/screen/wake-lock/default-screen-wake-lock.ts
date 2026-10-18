import '../../core/disposable-polyfill.ts'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { BrowserError } from '../../core/errors/browser-error.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { ScreenError } from '../errors/screen-error.ts'
import type { ScreenWakeLock, ScreenWakeLockEvents } from './screen-wake-lock.ts'
import { WakeLockHold } from './wake-lock-hold.ts'
import { WakeLockSupport } from './wake-lock-support.ts'

/**
 * The implementation of {@link ScreenWakeLock}.
 */
export class DefaultScreenWakeLock extends EventEmitter<ScreenWakeLockEvents> implements ScreenWakeLock {
  /**
   * For applications that only use the wake lock. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): ScreenWakeLock {
    return new DefaultScreenWakeLock(environment, logger)
  }

  private readonly holds = new Set<WakeLockHold>()
  /** what the browser handed out; gone as soon as the browser takes the lock back */
  private sentinel: WakeLockSentinel | undefined
  private acquiring: Promise<void> | undefined
  private watchedDocument: Document | undefined
  private announced = false

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {
    super()
  }

  public get isSupported(): boolean {
    return WakeLockSupport.isSupportedIn(this.environment)
  }

  public get isRequested(): boolean {
    return this.holds.size > 0
  }

  public get isActive(): boolean {
    return this.sentinel !== undefined
  }

  public async request(): Promise<WakeLockHold> {
    if (!this.isSupported) {
      throw new UnsupportedError('wakeLock')
    }

    const hold = new WakeLockHold((released) => this.released(released))
    this.holds.add(hold)
    this.watch()

    try {
      await this.acquire()
    } catch (error) {
      hold.release()
      throw error
    }

    return hold
  }

  public dispose(): void {
    for (const hold of [...this.holds]) {
      hold.release()
    }

    this.removeAllListeners()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  /**
   * One request to the browser at a time, whoever asks.
   */
  private acquire(): Promise<void> {
    this.acquiring ??= this.lock().finally(() => {
      this.acquiring = undefined
    })

    return this.acquiring
  }

  private async lock(): Promise<void> {
    const wakeLock = WakeLockSupport.resolveFor(this.environment)

    // a browser refuses a page in the background; the lock is taken when the page returns
    if (wakeLock === undefined || this.sentinel !== undefined || this.isHidden) {
      return
    }

    let sentinel: WakeLockSentinel

    try {
      sentinel = await wakeLock.request('screen')
    } catch (error) {
      // the page went to the background while the browser was asked
      if (this.isHidden) {
        return
      }

      throw BrowserError.hasName(error, 'NotAllowedError')
        ? new PermissionDeniedError('screen-wake-lock', { cause: error })
        : new ScreenError('Could not keep the screen on', { cause: error })
    }

    // the last hold may have been released while the browser was asked
    if (this.holds.size === 0) {
      this.giveBack(sentinel)

      return
    }

    sentinel.addEventListener('release', () => {
      if (this.sentinel === sentinel) {
        this.sentinel = undefined
        this.announce()
      }
    })

    this.sentinel = sentinel
    this.announce()
  }

  private released(hold: WakeLockHold): void {
    this.holds.delete(hold)

    if (this.holds.size > 0) {
      return
    }

    this.unwatch()

    const sentinel = this.sentinel
    this.sentinel = undefined

    if (sentinel !== undefined) {
      this.giveBack(sentinel)
    }

    this.announce()
  }

  private giveBack(sentinel: WakeLockSentinel): void {
    sentinel.release().catch((error: unknown) => this.logger.debug('Could not release the wake lock', error))
  }

  private get isHidden(): boolean {
    return this.environment.isBrowser && this.environment.document.visibilityState === 'hidden'
  }

  private watch(): void {
    if (this.watchedDocument === undefined && this.environment.isBrowser) {
      this.watchedDocument = this.environment.document
      this.watchedDocument.addEventListener('visibilitychange', this.visibilityChanged)
    }
  }

  private unwatch(): void {
    this.watchedDocument?.removeEventListener('visibilitychange', this.visibilityChanged)
    this.watchedDocument = undefined
  }

  private readonly visibilityChanged = (): void => {
    if (this.holds.size > 0 && !this.isHidden) {
      this.acquire().catch((error: unknown) =>
        this.logger.warn('Could not keep the screen on after the page returned', error)
      )
    }
  }

  private announce(): void {
    if (this.isActive !== this.announced) {
      this.announced = this.isActive
      this.emitSafely('change', this.announced, this.logger)
    }
  }
}
