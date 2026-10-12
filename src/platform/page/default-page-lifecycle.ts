import '../../core/disposable-polyfill.ts'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { PageVisibility } from '../../core/environment/page-visibility.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import type { PageLifecycle, PageLifecycleEvents, PageState } from './page-lifecycle.ts'

/**
 * The implementation of {@link PageLifecycle}.
 */
export class DefaultPageLifecycle extends EventEmitter<PageLifecycleEvents> implements PageLifecycle {
  private static readonly documentEvents = ['visibilitychange', 'freeze', 'resume'] as const

  /**
   * For applications that only use this. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): PageLifecycle {
    return new DefaultPageLifecycle(environment, logger)
  }

  private readonly visibility: PageVisibility
  private watchedDocument: Document | undefined
  private watchedWindow: Window | undefined
  private isFrozen = false
  private announced: PageState | undefined

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {
    super()
    this.visibility = new PageVisibility(environment)
  }

  public get state(): PageState | undefined {
    if (!this.environment.isBrowser) {
      return undefined
    }

    if (this.isFrozen) {
      return 'frozen'
    }

    return this.environment.document.visibilityState === 'hidden' ? 'hidden' : 'visible'
  }

  public get isVisible(): boolean {
    return this.state === 'visible'
  }

  public whenVisible(): Promise<void> {
    return this.visibility.whenVisible()
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

  protected override onFirstListener(type: keyof PageLifecycleEvents): void {
    if (!this.environment.isBrowser) {
      return
    }

    if (type === 'leave') {
      this.watchedWindow = this.environment.window
      this.watchedWindow.addEventListener('pagehide', this.left)

      return
    }

    this.watchedDocument = this.environment.document
    this.announced = this.state

    for (const name of DefaultPageLifecycle.documentEvents) {
      this.watchedDocument.addEventListener(name, this.changed)
    }
  }

  protected override onLastListenerRemoved(type: keyof PageLifecycleEvents): void {
    if (type === 'leave') {
      this.watchedWindow?.removeEventListener('pagehide', this.left)
      this.watchedWindow = undefined

      return
    }

    for (const name of DefaultPageLifecycle.documentEvents) {
      this.watchedDocument?.removeEventListener(name, this.changed)
    }

    this.watchedDocument = undefined
    this.isFrozen = false
  }

  private readonly changed = (event: Pick<Event, 'type'>): void => {
    if (event.type === 'freeze') {
      this.isFrozen = true
    } else if (event.type === 'resume') {
      this.isFrozen = false
    }

    const state = this.state

    if (state !== undefined && state !== this.announced) {
      this.announced = state
      this.emitSafely('change', state, this.logger)
    }
  }

  private readonly left = (event: Pick<PageTransitionEvent, 'persisted'>): void => {
    this.emitSafely('leave', { isKept: event.persisted === true }, this.logger)
  }
}
