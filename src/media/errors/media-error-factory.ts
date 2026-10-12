import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import type { MediaKind } from '../access/media-access-state.ts'
import { MediaDeviceBusyError } from './media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from './media-device-not-found-error.ts'
import { MediaError } from './media-error.ts'
import { MediaRequirementsError } from './media-requirements-error.ts'

/**
 * The single place that turns what the browser throws for a camera or a microphone into the errors of the library,
 * so the names of `DOMException` never reach the application.
 */
export class MediaErrorFactory {
  private static readonly deniedNames = ['NotAllowedError', 'SecurityError']
  private static readonly notFoundNames = ['NotFoundError']
  private static readonly busyNames = ['NotReadableError', 'AbortError']
  private static readonly requirementNames = ['OverconstrainedError']

  /**
   * @param action what was attempted, used as the message: "Could not open the camera"
   */
  public static from(error: unknown, action: string, kind: MediaKind): DeviceButlerError {
    if (error instanceof DeviceButlerError) {
      return error
    }

    const name = MediaErrorFactory.nameOf(error)

    if (MediaErrorFactory.deniedNames.includes(name)) {
      return new PermissionDeniedError(kind, { cause: error })
    }

    if (MediaErrorFactory.notFoundNames.includes(name)) {
      return new MediaDeviceNotFoundError(`${action}: there is no ${kind}`, { cause: error })
    }

    if (MediaErrorFactory.busyNames.includes(name)) {
      return new MediaDeviceBusyError(kind, 'unknown', { cause: error })
    }

    if (MediaErrorFactory.requirementNames.includes(name)) {
      const constraint = MediaErrorFactory.constraintOf(error)
      const detail = constraint === undefined ? 'a requirement' : `'${constraint}'`

      return new MediaRequirementsError(`${action}: ${detail} cannot be satisfied`, constraint, { cause: error })
    }

    return new MediaError(action, { cause: error })
  }

  /**
   * Whether the browser failed because a device cannot deliver what was asked of it.
   */
  public static isOverconstrained(error: unknown): boolean {
    return MediaErrorFactory.requirementNames.includes(MediaErrorFactory.nameOf(error))
  }

  private static nameOf(error: unknown): string {
    return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
      ? error.name
      : ''
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
