import type { Logger } from './logger.ts'

/**
 * The default logger. The library stays silent unless the application passes its own {@link Logger}.
 */
export class NullLogger implements Logger {
  /**
   * Drops the message.
   */
  public debug(): void {}

  /**
   * Drops the message.
   */
  public info(): void {}

  /**
   * Drops the message.
   */
  public warn(): void {}

  /**
   * Drops the message.
   */
  public error(): void {}
}
