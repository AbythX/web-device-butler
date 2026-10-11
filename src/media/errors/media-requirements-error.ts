import { MediaError } from './media-error.ts'

/**
 * No device can deliver what was required.
 */
export class MediaRequirementsError extends MediaError {
  /**
   * @param constraint the constraint the browser could not satisfy, where it names one
   */
  public constructor(
    message: string,
    public readonly constraint?: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'MediaRequirementsError'
  }
}
