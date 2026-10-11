import { ConsoleLogger, type Logger } from '../../src/index.ts'

/**
 * Shows the log of the library on the page, because a phone has no console to look at.
 */
export class PageLogger implements Logger {
  private readonly console = new ConsoleLogger()
  private readonly startedAt = performance.now()

  public constructor(private readonly output: HTMLElement) {}

  public debug(message: string, ...data: unknown[]): void {
    this.console.debug(message, ...data)
    this.write('debug', message, data)
  }

  public info(message: string, ...data: unknown[]): void {
    this.console.info(message, ...data)
    this.write('info', message, data)
  }

  public warn(message: string, ...data: unknown[]): void {
    this.console.warn(message, ...data)
    this.write('warn', message, data)
  }

  public error(message: string, ...data: unknown[]): void {
    this.console.error(message, ...data)
    this.write('error', message, data)
  }

  private write(level: string, message: string, data: readonly unknown[]): void {
    const seconds = ((performance.now() - this.startedAt) / 1000).toFixed(2)
    const details = data.map((entry) => PageLogger.format(entry)).join(' ')

    this.output.textContent = `${seconds}s ${level} ${message} ${details}\n${this.output.textContent ?? ''}`.slice(
      0,
      20_000
    )
  }

  private static format(entry: unknown): string {
    if (entry instanceof Error) {
      return `${entry.name}: ${entry.message}`
    }

    try {
      return JSON.stringify(entry) ?? String(entry)
    } catch {
      return String(entry)
    }
  }
}
