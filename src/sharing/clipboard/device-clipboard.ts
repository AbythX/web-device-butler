/**
 * The clipboard of the system (`butler.clipboard`): copies a text or a picture so the user can paste it elsewhere,
 * and reads the text the user copied.
 *
 * Browsers only allow it in answer to something the user did, such as a click, and some ask the user before a
 * page may read.
 */
export interface DeviceClipboard {
  /**
   * `false` where the browser gives pages no clipboard, or the page was not loaded over HTTPS.
   */
  readonly isSupported: boolean

  /**
   * Whether {@link write} can copy data of this type, for example `image/png`. Every browser that copies data
   * copies PNG pictures; few copy anything else.
   */
  canWrite(type: string): boolean

  /**
   * Copies a text.
   *
   * @throws UnsupportedError where there is no clipboard
   * @throws PermissionDeniedError if the browser or the user refuses
   * @throws SharingError if copying failed
   */
  writeText(text: string): Promise<void>

  /**
   * The text the user copied last. Empty if the clipboard holds something else.
   *
   * @throws UnsupportedError where the browser does not let pages read the clipboard
   * @throws PermissionDeniedError if the browser or the user refuses
   * @throws SharingError if reading failed
   */
  readText(): Promise<string>

  /**
   * Copies data by its type, for example a photo as `image/png`.
   *
   * @throws UnsupportedError if the browser cannot copy data of this type
   * @throws PermissionDeniedError if the browser or the user refuses
   * @throws SharingError if copying failed
   */
  write(data: Blob): Promise<void>
}
