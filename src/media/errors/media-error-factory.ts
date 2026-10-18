import { BrowserError } from '../../core/errors/browser-error.ts'
import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import type { MediaSourceKind } from '../session/media-source-kind.ts'
import { MediaDeviceBusyError } from './media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from './media-device-not-found-error.ts'
import { MediaError } from './media-error.ts'
import { MediaRequirementsError } from './media-requirements-error.ts'

/**
 * The single place that turns what the browser throws for a camera, a microphone or the capture of the screen into
 * the errors of the library, so the names of `DOMException` never reach the application.
 */
export class MediaErrorFactory {
  /** besides a refusal, which every area shares */
  private static readonly deniedNames = ['SecurityError']
  private static readonly notFoundNames = ['NotFoundError']
  private static readonly busyNames = ['NotReadableError', 'AbortError']
  private static readonly requirementNames = ['OverconstrainedError']
  /** what the capture of the screen fails with when it was not called in answer to a click */
  private static readonly withoutActivationNames = ['InvalidStateError', 'InvalidAccessError']

  /**
   * @param action what was attempted, used as the message: "Could not open the camera"
   */
  public static from(error: unknown, action: string, kind: MediaSourceKind): DeviceButlerError {
    if (error instanceof DeviceButlerError) {
      return error
    }

    const name = BrowserError.nameOf(error)

    if (BrowserError.isRefusal(error) || MediaErrorFactory.deniedNames.includes(name)) {
      return new PermissionDeniedError(kind === 'screen' ? 'display-capture' : kind, { cause: error })
    }

    if (MediaErrorFactory.notFoundNames.includes(name)) {
      return new MediaDeviceNotFoundError(`${action}: there is no ${kind}`, { cause: error })
    }

    if (MediaErrorFactory.busyNames.includes(name)) {
      // no other tab can hold the screen; the system refused to let the browser capture it
      return kind === 'screen'
        ? new MediaError(`${action}: the system did not let the browser capture the screen`, { cause: error })
        : new MediaDeviceBusyError(kind, 'unknown', { cause: error })
    }

    if (MediaErrorFactory.requirementNames.includes(name)) {
      const constraint = MediaErrorFactory.constraintOf(error)
      const detail = constraint === undefined ? 'a requirement' : `'${constraint}'`

      return new MediaRequirementsError(`${action}: ${detail} cannot be satisfied`, constraint, { cause: error })
    }

    return new MediaError(action, { cause: error })
  }

  /**
   * Translates what the capture of the screen fails with. Without a click of the user just before, the browsers
   * refuse the call, which says nothing about the permission.
   *
   * @param action what was attempted, used as the message: "Could not capture the screen"
   * @param wasActivated whether the user had just clicked when the call was made; `undefined` where the browser
   *   cannot tell
   */
  public static fromScreenCapture(
    error: unknown,
    action: string,
    wasActivated: boolean | undefined
  ): DeviceButlerError {
    const isWithoutActivation =
      BrowserError.hasName(error, ...MediaErrorFactory.withoutActivationNames) ||
      (wasActivated === false && BrowserError.isRefusal(error))

    if (isWithoutActivation) {
      return new MediaError(`${action}: open() has to be called in answer to a click or a key of the user`, {
        cause: error,
      })
    }

    return MediaErrorFactory.from(error, action, 'screen')
  }

  /**
   * Translates what sending the sound of an element to an audio output fails with.
   *
   * @param action what was attempted, used as the message of every other failure
   * @param id the output the sound was sent to
   */
  public static fromAudioOutput(error: unknown, action: string, id: string): DeviceButlerError {
    if (error instanceof DeviceButlerError) {
      return error
    }

    if (MediaErrorFactory.notFoundNames.includes(BrowserError.nameOf(error))) {
      return new MediaDeviceNotFoundError(`There is no audio output with the id '${id}'`, { cause: error })
    }

    if (BrowserError.isRefusal(error)) {
      return new PermissionDeniedError('speaker-selection', { cause: error })
    }

    return new MediaError(action, { cause: error })
  }

  /**
   * Whether the user closed the list of the audio outputs. The browser rejects with a refusal then, which is no
   * refusal of a permission here.
   */
  public static isOutputChoiceCancelled(error: unknown): boolean {
    return BrowserError.isRefusal(error)
  }

  /**
   * Whether the browser failed because a device cannot deliver what was asked of it.
   */
  public static isOverconstrained(error: unknown): boolean {
    return BrowserError.hasName(error, ...MediaErrorFactory.requirementNames)
  }

  private static constraintOf(error: unknown): string | undefined {
    return typeof error === 'object' &&
      error !== null &&
      'constraint' in error &&
      typeof error.constraint === 'string' &&
      error.constraint.length > 0
      ? error.constraint
      : undefined
  }
}
