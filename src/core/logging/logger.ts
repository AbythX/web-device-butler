/**
 * The contract an application implements to receive the log output of the library.
 */
export interface Logger {
  /** what the library does, step by step; only of interest while looking for a problem */
  debug(message: string, ...data: unknown[]): void
  /** what happened that an application may want to know about */
  info(message: string, ...data: unknown[]): void
  /** something went wrong and the library carried on, usually with less */
  warn(message: string, ...data: unknown[]): void
  /** something went wrong that the library could not make up for */
  error(message: string, ...data: unknown[]): void
}
