import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { SharingErrorFactory } from '../errors/sharing-error-factory.ts'
import type { DeviceShare, ShareContent } from './device-share.ts'
import { ShareSupport } from './share-support.ts'

/**
 * The implementation of {@link DeviceShare}.
 */
export class DefaultDeviceShare implements DeviceShare {
  /**
   * For applications that only use this. Otherwise it is reached through `DeviceButler`.
   */
  public static create(environment: BrowserEnvironment = BrowserEnvironment.browser()): DeviceShare {
    return new DefaultDeviceShare(environment)
  }

  public constructor(private readonly environment: BrowserEnvironment) {}

  public get isSupported(): boolean {
    return ShareSupport.isSupportedIn(this.environment)
  }

  public canShare(content: ShareContent): boolean {
    const sheet = ShareSupport.resolveFor(this.environment)

    if (sheet === undefined || DefaultDeviceShare.isEmpty(content)) {
      return false
    }

    const data = DefaultDeviceShare.dataOf(content)

    // a browser that cannot be asked is one from before files could be shared
    return typeof sheet.canShare === 'function' ? sheet.canShare(data) : data.files === undefined
  }

  public async share(content: ShareContent): Promise<boolean> {
    const sheet = ShareSupport.resolveFor(this.environment)

    if (sheet === undefined || !this.canShare(content)) {
      throw new UnsupportedError('share')
    }

    try {
      await sheet.share(DefaultDeviceShare.dataOf(content))

      return true
    } catch (error) {
      if (SharingErrorFactory.isCancellation(error)) {
        return false
      }

      throw SharingErrorFactory.from(error, 'share', 'The browser could not share this')
    }
  }

  private static isEmpty({ title, text, url, files = [] }: ShareContent): boolean {
    return title === undefined && text === undefined && url === undefined && files.length === 0
  }

  /**
   * Only the fields that are set: a browser takes an empty list of files for a request to share files.
   */
  private static dataOf({ title, text, url, files = [] }: ShareContent): ShareData {
    const data: ShareData = {}

    if (title !== undefined) {
      data.title = title
    }

    if (text !== undefined) {
      data.text = text
    }

    if (url !== undefined) {
      data.url = url
    }

    if (files.length > 0) {
      data.files = [...files]
    }

    return data
  }
}
