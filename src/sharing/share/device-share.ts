/**
 * What is handed to the share sheet. At least one field has to be set.
 */
export interface ShareContent {
  title?: string
  text?: string
  url?: string
  /** for example a photo or a recording; not every browser that shares can share files */
  files?: readonly File[]
}

/**
 * Hands something over to another application through the share sheet of the system (`butler.share`): a link, a
 * text, a photo that was just taken.
 */
export interface DeviceShare {
  /**
   * `false` where the browser has no share sheet, or the page was not loaded over HTTPS.
   */
  readonly isSupported: boolean

  /**
   * Whether the browser can share this. A browser that shares links does not have to share files, and one that
   * shares files not every kind of them.
   */
  canShare(content: ShareContent): boolean

  /**
   * Opens the share sheet. Browsers only allow it in answer to something the user did, such as a click.
   *
   * @returns `false` if the user closed the sheet without sharing
   * @throws UnsupportedError if the browser cannot share this
   * @throws PermissionDeniedError if the browser refuses, for example because the user did not ask for it
   * @throws SharingError if sharing failed
   */
  share(content: ShareContent): Promise<boolean>
}
