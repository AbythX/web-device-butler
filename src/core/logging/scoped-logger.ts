import type { Logger } from './logger.ts'

/**
 * Prefixes every message with the name of the class that logs it, so all classes can share the one {@link Logger} of
 * the application.
 */
export class ScopedLogger implements Logger {
  public constructor(
    private readonly scope: string,
    private readonly target: Logger
  ) {}

  /**
   * Passes the message on as `debug`, with the scope in front.
   */
  public debug(message: string, ...data: unknown[]): void {
    this.target.debug(this.format(message), ...data)
  }

  /**
   * Passes the message on as `info`, with the scope in front.
   */
  public info(message: string, ...data: unknown[]): void {
    this.target.info(this.format(message), ...data)
  }

  /**
   * Passes the message on as `warn`, with the scope in front.
   */
  public warn(message: string, ...data: unknown[]): void {
    this.target.warn(this.format(message), ...data)
  }

  /**
   * Passes the message on as `error`, with the scope in front.
   */
  public error(message: string, ...data: unknown[]): void {
    this.target.error(this.format(message), ...data)
  }

  private format(message: string) {
    return `[${this.scope}] ${message}`
  }
}
