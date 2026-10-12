import { DeviceButlerError } from '../../core/errors/device-butler-error.ts'

/**
 * The browser could not do what was asked of the screen: keep it on, fill it with an element or keep it from
 * turning. The error of the browser is kept as `cause`.
 */
export class ScreenError extends DeviceButlerError {
  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ScreenError'
  }
}
