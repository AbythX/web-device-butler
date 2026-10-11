import type { Logger } from './logger.ts'

/**
 * Writes to a console. The global console is only resolved when something is logged, so the class can be constructed
 * in any environment.
 */
export class ConsoleLogger implements Logger {
  public constructor(private readonly target?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>) {}

  /**
   * Writes to `console.debug`.
   */
  public debug(message: string, ...data: unknown[]): void {
    this.console.debug(message, ...data)
  }

  /**
   * Writes to `console.info`.
   */
  public info(message: string, ...data: unknown[]): void {
    this.console.info(message, ...data)
  }

  /**
   * Writes to `console.warn`.
   */
  public warn(message: string, ...data: unknown[]): void {
    this.console.warn(message, ...data)
  }

  /**
   * Writes to `console.error`.
   */
  public error(message: string, ...data: unknown[]): void {
    this.console.error(message, ...data)
  }

  private get console() {
    return this.target ?? globalThis.console
  }
}
