import { BrowserError } from '../../core/errors/browser-error.ts'
import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { ScreenError } from './screen-error.ts'

/**
 * What a caller maps besides the failure itself. Each names only what its call of the browser can fail with.
 */
export interface ScreenErrorMapping {
  /** what a refusal (`NotAllowedError`) denies: `screen-wake-lock` */
  readonly permission?: string
  /** what a browser that has the call but cannot do it (`NotSupportedError`) lacks: `orientation lock` */
  readonly feature?: string
}

/**
 * The single place that turns what the browser throws for the screen into the errors of the library: keeping it on,
 * filling it with an element and keeping it from turning.
 */
export class ScreenErrorFactory {
  /**
   * @param action what could not be done, used as the message of every other failure: "Could not keep the screen on"
   */
  public static from(error: unknown, action: string, mapping: ScreenErrorMapping = {}): DeviceButlerError {
    if (error instanceof DeviceButlerError) {
      return error
    }

    const { permission, feature } = mapping

    if (permission !== undefined && BrowserError.isRefusal(error)) {
      return new PermissionDeniedError(permission, { cause: error })
    }

    if (feature !== undefined && BrowserError.hasName(error, 'NotSupportedError')) {
      return new UnsupportedError(feature, { cause: error })
    }

    return new ScreenError(action, { cause: error })
  }
}
