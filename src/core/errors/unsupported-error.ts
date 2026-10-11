import { DeviceError } from './device-error.ts'

/**
 * The current browser or context does not provide what was asked for.
 */
export class UnsupportedError extends DeviceError {
  public constructor(
    public readonly feature: string,
    options?: ErrorOptions
  ) {
    super(`'${feature}' is not available in this environment`, options)
    // set explicitly, so the name survives a minifier that renames classes
    this.name = 'UnsupportedError'
  }
}
