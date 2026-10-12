/**
 * The root of every error the library throws.
 */
export abstract class DeviceButlerError extends Error {
  protected constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}
