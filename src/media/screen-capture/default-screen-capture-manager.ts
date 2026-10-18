import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { CaptureControllerLike } from '../../core/environment/display-media-like.ts'
import { BrowserError } from '../../core/errors/browser-error.ts'
import type { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { MediaError } from '../errors/media-error.ts'
import { MediaErrorFactory } from '../errors/media-error-factory.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import type { ScreenCaptureFocus, ScreenCaptureRequirements } from './model/screen-capture-requirements.ts'
import type { ScreenCaptureManager } from './screen-capture-manager.ts'
import { ScreenCaptureSupport } from './screen-capture-support.ts'
import { DefaultScreenCaptureSession, type ScreenCaptureTiming } from './session/default-screen-capture-session.ts'
import { ScreenCaptureConstraints } from './session/screen-capture-constraints.ts'
import type { ScreenCaptureSession } from './session/screen-capture-session.ts'

/**
 * The implementation of {@link ScreenCaptureManager}.
 */
export class DefaultScreenCaptureManager implements ScreenCaptureManager {
  private static readonly action = 'Could not capture the screen'
  /** what the browsers throw when the picker was asked for without a click of the user */
  private static readonly withoutActivationNames = ['InvalidStateError', 'InvalidAccessError']

  /**
   * For applications that only capture the screen. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    configuration: ScreenCaptureRequirements = {},
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): ScreenCaptureManager {
    return new DefaultScreenCaptureManager(configuration, environment, logger)
  }

  private defaults: ScreenCaptureRequirements
  private readonly sessions = new Set<ScreenCaptureSession>()
  private isDisposed = false

  public constructor(
    configuration: ScreenCaptureRequirements,
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger,
    private readonly timing: ScreenCaptureTiming = {}
  ) {
    this.defaults = DefaultScreenCaptureManager.merge({}, configuration)
  }

  public get isSupported(): boolean {
    return ScreenCaptureSupport.isSupportedIn(this.environment)
  }

  public get configuration(): Readonly<ScreenCaptureRequirements> {
    return this.defaults
  }

  public configure(changes: Partial<ScreenCaptureRequirements>): void {
    this.defaults = DefaultScreenCaptureManager.merge(this.defaults, changes)
  }

  public async open(requirements?: Partial<ScreenCaptureRequirements>): Promise<ScreenCaptureSession> {
    this.assertNotDisposed()

    const capture = ScreenCaptureSupport.resolveFor(this.environment)

    if (capture === undefined) {
      throw new UnsupportedError('getDisplayMedia')
    }

    const merged = DefaultScreenCaptureManager.merge(this.defaults, requirements)
    const controller = this.controllerFor(merged.focus)
    // read before the call: the browser may use up the activation while it shows the picker
    const wasActivated = this.environment.hasUserActivation

    let stream: MediaStream

    try {
      stream = await capture(ScreenCaptureConstraints.options(merged, controller))
    } catch (error) {
      throw DefaultScreenCaptureManager.translate(error, wasActivated)
    }

    // the browser decides about the focus right after the call, so this cannot wait
    this.decideFocus(controller, merged.focus)

    const session = new DefaultScreenCaptureSession(stream, merged.content, this.logger, this.timing)
    const unmet = ScreenCaptureConstraints.unmet(merged.require, session.settings, session.audio !== undefined)

    if (unmet.length > 0) {
      await session.close()

      throw new MediaRequirementsError(
        `${DefaultScreenCaptureManager.action}: what the user chose to share does not have ${unmet.join(', ')}`,
        unmet[0]
      )
    }

    if (this.isDisposed) {
      await session.close()
      this.assertNotDisposed()
    }

    this.sessions.add(session)
    session.on('ended', () => this.sessions.delete(session))
    this.logger.debug('Capturing the screen', session.settings)

    return session
  }

  public async dispose(): Promise<void> {
    this.isDisposed = true

    await Promise.allSettled([...this.sessions].map((session) => session.close()))
    this.sessions.clear()
  }

  private controllerFor(focus: ScreenCaptureFocus | undefined): CaptureControllerLike | undefined {
    const CaptureController = focus === undefined ? undefined : this.environment.CaptureController

    return CaptureController === undefined ? undefined : new CaptureController()
  }

  private decideFocus(controller: CaptureControllerLike | undefined, focus: ScreenCaptureFocus | undefined): void {
    try {
      controller?.setFocusBehavior?.(focus === 'keep-page' ? 'no-focus-change' : 'focus-captured-surface')
    } catch (error) {
      // a whole screen has no focus to decide
      this.logger.debug('The browser did not take the focus behaviour', error)
    }
  }

  private assertNotDisposed(): void {
    if (this.isDisposed) {
      throw new MediaError('The screen cannot be captured any more, the butler was disposed')
    }
  }

  /**
   * @param wasActivated whether the user had just clicked when the call was made; `undefined` where the browser
   *   cannot tell
   */
  private static translate(error: unknown, wasActivated: boolean | undefined): DeviceButlerError {
    const name = BrowserError.nameOf(error)

    const isWithoutActivation =
      DefaultScreenCaptureManager.withoutActivationNames.includes(name) ||
      (wasActivated === false && name === 'NotAllowedError')

    if (isWithoutActivation) {
      return new MediaError(
        `${DefaultScreenCaptureManager.action}: open() has to be called in answer to a click or a key of the user`,
        { cause: error }
      )
    }

    return MediaErrorFactory.from(error, DefaultScreenCaptureManager.action, 'screen')
  }

  private static merge(
    base: ScreenCaptureRequirements,
    changes: Partial<ScreenCaptureRequirements> | undefined
  ): ScreenCaptureRequirements {
    const merged: ScreenCaptureRequirements = { ...base }

    // SAFETY: changes is a Partial of the requirements, so its keys are keys of the requirements
    for (const key of Object.keys(changes ?? {}) as (keyof ScreenCaptureRequirements)[]) {
      const value = changes?.[key]

      if (value !== undefined) {
        Object.assign(merged, { [key]: value })
      }
    }

    return merged
  }
}
