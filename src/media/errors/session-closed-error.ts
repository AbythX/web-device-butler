import { MediaError } from './media-error.ts'

/**
 * Something was asked of a session after it was closed or after its device went away.
 */
export class SessionClosedError extends MediaError {
  public constructor(message = 'The session is closed', options?: ErrorOptions) {
    super(message, options)
    this.name = 'SessionClosedError'
  }
}
