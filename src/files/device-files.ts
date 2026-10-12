export interface FileSaveOptions {
  /** the name the file is suggested to have, with its extension: `scan.jpg` */
  name: string
  /** what the save dialog calls this kind of file, where the browser shows one: `Photo` */
  description?: string
}

/**
 * - `saved`: the user chose where, and the file was written there
 * - `downloaded`: the browser was handed the file as a download, and puts it where its downloads go
 * - `cancelled`: the user closed the dialog without choosing
 */
export type FileSaveOutcome = 'saved' | 'downloaded' | 'cancelled'

export interface FilePickOptions {
  /** the kinds of file to offer, as MIME types or extensions: `image/*`, `.pdf`. Default: every file. */
  accept?: string | readonly string[]
  /** let the user choose several files; default: `false` */
  multiple?: boolean
  /**
   * Take a new picture, video or sound with the application of the system instead of choosing a file, on the
   * devices that have one: `environment` for the camera on the back, `user` for the one on the front. Phones offer
   * this where a page gets no camera of its own. Ignored on a desktop, which shows the file dialog.
   */
  capture?: 'user' | 'environment'
  /** stops waiting for the user; the call rejects with the reason of the signal */
  signal?: AbortSignal
}

/**
 * Files of the device (`butler.files`): saves a photo or a recording where the user can find it, and takes a file
 * the user chooses.
 *
 * Browsers only show their dialogs in answer to something the user did, such as a click.
 */
export interface DeviceFiles {
  /**
   * Whether {@link save} lets the user choose where the file goes. Everywhere else the file is a download.
   */
  readonly canChooseWhereToSave: boolean

  /**
   * Saves the data as a file. Where the browser has a save dialog, the user chooses the place; everywhere else,
   * and where the dialog cannot be shown, the browser gets the file as a download.
   *
   * @throws UnsupportedError where there is no page
   * @throws FileError if the file could not be written
   */
  save(data: Blob, options: FileSaveOptions): Promise<FileSaveOutcome>

  /**
   * Lets the user choose files of the device, or take a new picture with `capture`.
   *
   * @returns the files; empty if the user closed the dialog without choosing. Older browsers do not say when the
   *   user closes the dialog: there the call only ends through its `signal`.
   * @throws UnsupportedError where there is no page
   */
  pick(options?: FilePickOptions): Promise<File[]>
}
