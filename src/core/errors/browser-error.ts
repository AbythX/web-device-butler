/**
 * Reads what the browser put on what it threw or reported. The rest of the library asks here instead of checking the
 * shape itself.
 */
export class BrowserError {
  /**
   * @returns the `name` of a `DOMException` or an `Error`; `''` for anything else
   */
  public static nameOf(error: unknown): string {
    return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
      ? error.name
      : ''
  }

  /**
   * @returns the numeric `code` of a `GeolocationPositionError` and the like; `undefined` for anything else
   */
  public static codeOf(error: unknown): number | undefined {
    return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number'
      ? error.code
      : undefined
  }

  /**
   * Whether the browser failed with one of the names: `hasName(error, 'NotAllowedError')`.
   */
  public static hasName(error: unknown, ...names: readonly string[]): boolean {
    return names.includes(BrowserError.nameOf(error))
  }
}
