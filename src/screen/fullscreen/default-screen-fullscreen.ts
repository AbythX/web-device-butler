import '../../core/disposable-polyfill.ts'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { ScreenError } from '../errors/screen-error.ts'
import { type FullscreenDocument, FullscreenSupport } from './fullscreen-support.ts'
import type { ScreenFullscreen, ScreenFullscreenEvents } from './screen-fullscreen.ts'

/**
 * The calls an element can have to fill the screen: the standard one, the one older browsers have under a prefix,
 * and the ones a phone has for videos only.
 */
interface FullscreenElement extends Element {
  webkitRequestFullscreen?(): Promise<void> | void
  webkitEnterFullscreen?(): void
  webkitExitFullscreen?(): void
  webkitDisplayingFullscreen?: boolean
}

/**
 * The implementation of {@link ScreenFullscreen}.
 */
export class DefaultScreenFullscreen extends EventEmitter<ScreenFullscreenEvents> implements ScreenFullscreen {
  private static readonly documentEvents = ['fullscreenchange', 'webkitfullscreenchange'] as const
  private static readonly videoEvents = ['webkitbeginfullscreen', 'webkitendfullscreen'] as const

  /**
   * For applications that only use this. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): ScreenFullscreen {
    return new DefaultScreenFullscreen(environment, logger)
  }

  private watchedDocument: FullscreenDocument | undefined
  /** a video that fills the screen the way a phone does it, which the document knows nothing about */
  private video: FullscreenElement | undefined

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {
    super()
  }

  public get isSupported(): boolean {
    return FullscreenSupport.isSupportedIn(this.environment)
  }

  public get element(): Element | undefined {
    const document = FullscreenSupport.resolveFor(this.environment)

    return (
      document?.fullscreenElement ??
      document?.webkitFullscreenElement ??
      (this.video?.webkitDisplayingFullscreen ? this.video : undefined)
    )
  }

  public get isActive(): boolean {
    return this.element !== undefined
  }

  public canEnter(element: Element): boolean {
    const candidate: FullscreenElement = element

    if (typeof candidate.requestFullscreen === 'function' || typeof candidate.webkitRequestFullscreen === 'function') {
      return this.isSupported
    }

    return typeof candidate.webkitEnterFullscreen === 'function'
  }

  public async enter(element: Element, options?: FullscreenOptions): Promise<void> {
    const target: FullscreenElement = element

    if (!this.canEnter(target)) {
      throw new UnsupportedError('fullscreen')
    }

    try {
      if (typeof target.requestFullscreen === 'function') {
        await target.requestFullscreen(options)
      } else if (typeof target.webkitRequestFullscreen === 'function') {
        await target.webkitRequestFullscreen()
      } else {
        this.enterWithVideo(target)
      }
    } catch (error) {
      throw new ScreenError('The browser did not fill the screen with the element', { cause: error })
    }
  }

  public async exit(): Promise<void> {
    const document = FullscreenSupport.resolveFor(this.environment)
    const video = this.video

    try {
      if (document?.fullscreenElement) {
        await document.exitFullscreen?.()
      } else if (document?.webkitFullscreenElement) {
        await document.webkitExitFullscreen?.()
      } else if (video?.webkitDisplayingFullscreen) {
        video.webkitExitFullscreen?.()
      }
    } catch (error) {
      throw new ScreenError('The browser did not return to the page', { cause: error })
    }
  }

  public dispose(): void {
    this.removeAllListeners()
    this.forgetVideo()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  protected override onFirstListener(): void {
    this.watchedDocument = FullscreenSupport.resolveFor(this.environment)

    for (const type of DefaultScreenFullscreen.documentEvents) {
      this.watchedDocument?.addEventListener(type, this.changed)
    }
  }

  protected override onLastListenerRemoved(): void {
    for (const type of DefaultScreenFullscreen.documentEvents) {
      this.watchedDocument?.removeEventListener(type, this.changed)
    }

    this.watchedDocument = undefined
  }

  /**
   * A phone that fills the screen with a video only tells the video about it.
   */
  private enterWithVideo(video: FullscreenElement): void {
    this.forgetVideo()
    this.video = video

    for (const type of DefaultScreenFullscreen.videoEvents) {
      video.addEventListener(type, this.changed)
    }

    video.webkitEnterFullscreen?.()
  }

  private forgetVideo(): void {
    for (const type of DefaultScreenFullscreen.videoEvents) {
      this.video?.removeEventListener(type, this.changed)
    }

    this.video = undefined
  }

  private readonly changed = (): void => {
    this.emitSafely('change', this.element, this.logger)
  }
}
