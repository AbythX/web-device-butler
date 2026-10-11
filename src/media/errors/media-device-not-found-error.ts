import { MediaError } from './media-error.ts'

/**
 * There is no such device: none of the kind at all, or none with the requested id.
 */
export class MediaDeviceNotFoundError extends MediaError {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MediaDeviceNotFoundError'
  }
}
