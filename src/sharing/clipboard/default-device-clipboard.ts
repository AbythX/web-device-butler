import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { SharingErrorFactory } from '../errors/sharing-error-factory.ts'
import { ClipboardSupport } from './clipboard-support.ts'
import type { DeviceClipboard } from './device-clipboard.ts'

/**
 * The implementation of {@link DeviceClipboard}.
 */
export class DefaultDeviceClipboard implements DeviceClipboard {
  /**
   * For applications that only use this. Otherwise it is reached through `DeviceButler`.
   */
  public static create(environment: BrowserEnvironment = BrowserEnvironment.browser()): DeviceClipboard {
    return new DefaultDeviceClipboard(environment)
  }

  public constructor(private readonly environment: BrowserEnvironment) {}

  public get isSupported(): boolean {
    return ClipboardSupport.isSupportedIn(this.environment)
  }

  public canWrite(type: string): boolean {
    return ClipboardSupport.canWriteIn(this.environment, type)
  }

  public async writeText(text: string): Promise<void> {
    const clipboard = ClipboardSupport.resolveFor(this.environment)

    if (clipboard === undefined || typeof clipboard.writeText !== 'function') {
      throw new UnsupportedError('clipboard')
    }

    try {
      await clipboard.writeText(text)
    } catch (error) {
      throw SharingErrorFactory.from(error, 'clipboard', 'The browser could not copy the text')
    }
  }

  public async readText(): Promise<string> {
    const clipboard = ClipboardSupport.resolveFor(this.environment)

    if (clipboard === undefined || typeof clipboard.readText !== 'function') {
      throw new UnsupportedError('clipboard')
    }

    try {
      return await clipboard.readText()
    } catch (error) {
      throw SharingErrorFactory.from(error, 'clipboard', 'The browser could not read the clipboard')
    }
  }

  public async write(data: Blob): Promise<void> {
    const clipboard = ClipboardSupport.resolveFor(this.environment)
    const ClipboardItem = ClipboardSupport.resolveItemFor(this.environment)

    if (clipboard === undefined || ClipboardItem === undefined || !this.canWrite(data.type)) {
      throw new UnsupportedError(`clipboard (${data.type})`)
    }

    try {
      await clipboard.write([new ClipboardItem({ [data.type]: data })])
    } catch (error) {
      throw SharingErrorFactory.from(error, 'clipboard', `The browser could not copy the ${data.type}`)
    }
  }
}
