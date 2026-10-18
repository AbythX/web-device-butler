import { BrowserEnvironment, type SaveFilePickerOptions } from '../core/environment/browser-environment.ts'
import { BrowserError } from '../core/errors/browser-error.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import type { Logger } from '../core/logging/logger.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import type { DeviceFiles, FilePickOptions, FileSaveOptions, FileSaveOutcome } from './device-files.ts'
import { FileError } from './errors/file-error.ts'
import { FileSupport } from './file-support.ts'

/**
 * The implementation of {@link DeviceFiles}.
 */
export class DefaultDeviceFiles implements DeviceFiles {
  /** a download that the browser has not started by then is not going to start; in milliseconds */
  private static readonly downloadLifetime = 60_000

  /**
   * For applications that only use this. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): DeviceFiles {
    return new DefaultDeviceFiles(environment, logger)
  }

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {}

  public get canChooseWhereToSave(): boolean {
    return FileSupport.canChooseWhereToSaveIn(this.environment)
  }

  public async save(data: Blob, options: FileSaveOptions): Promise<FileSaveOutcome> {
    const showPicker = FileSupport.resolveFor(this.environment)

    if (showPicker === undefined) {
      return this.download(data, options.name)
    }

    let handle: FileSystemFileHandle

    try {
      handle = await showPicker(DefaultDeviceFiles.pickerOptionsFor(data, options))
    } catch (error) {
      if (BrowserError.hasName(error, 'AbortError')) {
        return 'cancelled'
      }

      // the dialog could not be shown, for example because the click was too long ago; a download needs no dialog
      this.logger.debug('The browser did not show its save dialog, handing the file over as a download', error)

      return this.download(data, options.name)
    }

    try {
      const writable = await handle.createWritable()
      await writable.write(data)
      await writable.close()
    } catch (error) {
      throw new FileError(`Could not write the file '${options.name}'`, { cause: error })
    }

    return 'saved'
  }

  public pick(options: FilePickOptions = {}): Promise<File[]> {
    const { accept, multiple = false, capture, signal } = options

    if (!FileSupport.canPickIn(this.environment)) {
      return Promise.reject(new UnsupportedError('document'))
    }

    if (signal?.aborted) {
      return Promise.reject(signal.reason)
    }

    const { document } = this.environment
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = multiple
    input.style.display = 'none'

    if (accept !== undefined) {
      input.accept = typeof accept === 'string' ? accept : accept.join(',')
    }

    if (capture !== undefined) {
      input.setAttribute('capture', capture)
    }

    return new Promise((resolve, reject) => {
      const finish = (settle: () => void): void => {
        signal?.removeEventListener('abort', abort)
        input.remove()
        settle()
      }

      const abort = (): void => finish(() => reject(signal?.reason))

      input.addEventListener('change', () => finish(() => resolve([...(input.files ?? [])])))
      input.addEventListener('cancel', () => finish(() => resolve([])))
      signal?.addEventListener('abort', abort, { once: true })

      // some browsers only tell an input about its files while it is part of the page
      document.body.append(input)
      input.click()
    })
  }

  /**
   * Hands the file to the browser as a download, through a link that is clicked for the user.
   */
  private download(data: Blob, name: string): FileSaveOutcome {
    if (!FileSupport.canSaveIn(this.environment)) {
      throw new UnsupportedError('document')
    }

    const { document } = this.environment
    const url = this.environment.createObjectUrl(data)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.rel = 'noopener'
    link.style.display = 'none'

    document.body.append(link)
    link.click()
    link.remove()

    // the browser reads the data after the click; the address is given back once it has had its time
    setTimeout(() => this.environment.revokeObjectUrl(url), DefaultDeviceFiles.downloadLifetime)

    return 'downloaded'
  }

  /**
   * The dialog offers the kind of the file only if both its type and its extension are known.
   */
  private static pickerOptionsFor(data: Blob, { name, description }: FileSaveOptions): SaveFilePickerOptions {
    const extension = /\.[A-Za-z0-9]+$/.exec(name)?.[0]

    if (extension === undefined || data.type.length === 0) {
      return { suggestedName: name }
    }

    // a type can carry parameters, such as the codecs of a recording, which the dialog does not take
    const type = data.type.split(';')[0]?.trim() ?? data.type

    return { suggestedName: name, types: [{ description, accept: { [type]: [extension] } }] }
  }
}
