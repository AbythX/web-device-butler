import type { ScreenCaptureRequirements } from './model/screen-capture-requirements.ts'
import type { ScreenCaptureSession } from './session/screen-capture-session.ts'

/**
 * Captures what is on the screen (`butler.screenCapture`): a whole screen, a window or a tab, whichever the user
 * chooses in the picker of the browser.
 *
 * There is nothing to list and nothing to select: the browser does not tell a page what could be shared. Several
 * captures can run at once, in one tab or in several, so there is no lock and no `whenBusy`.
 */
export interface ScreenCaptureManager {
  /**
   * `false` where the browser cannot capture the screen, which includes the browsers on phones and pages that were
   * not loaded over HTTPS.
   */
  readonly isSupported: boolean

  /**
   * The current defaults: what `open()` uses where a call does not say otherwise.
   */
  readonly configuration: Readonly<ScreenCaptureRequirements>

  /**
   * Replaces single fields of the defaults. Sessions that are open keep what they were opened with.
   */
  configure(changes: Partial<ScreenCaptureRequirements>): void

  /**
   * Shows the picker of the browser and captures what the user chooses. It has to be called in answer to a click or
   * a key of the user, because the browsers show the picker only then.
   *
   * The requirements are merged over the configured defaults; a field of the call replaces the configured field as
   * a whole. The browser is asked for what is preferred, and for what is required where nothing is preferred. What
   * is required is checked once the user has chosen: a capture without it is stopped again.
   *
   * @throws UnsupportedError where the browser cannot capture the screen
   * @throws PermissionDeniedError if the user cancelled the picker, or the browser or the system does not allow it
   * @throws MediaRequirementsError if what the user chose does not have what is required; the user sees the picker
   *   again on the next call
   * @throws MediaError if the call was not made in answer to the user, or the browser failed otherwise
   */
  open(requirements?: Partial<ScreenCaptureRequirements>): Promise<ScreenCaptureSession>

  /**
   * Stops every capture that is open. No capture can be opened afterwards.
   */
  dispose(): Promise<void>
}
