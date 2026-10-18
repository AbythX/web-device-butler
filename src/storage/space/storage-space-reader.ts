import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { StorageSupport } from '../storage-support.ts'
import { StorageSpace } from './storage-space.ts'

/**
 * Reads the space of the origin from the browser (`navigator.storage`).
 */
export class StorageSpaceReader {
  public constructor(private readonly environment: BrowserEnvironment) {}

  /**
   * Never rejects. Where the browser has no estimate, the result is not known.
   */
  public async read(): Promise<StorageSpace> {
    const storage = StorageSupport.resolveFor(this.environment)

    if (storage === undefined) {
      return StorageSpace.unknown()
    }

    const isPersistent = await this.isPersistent()

    try {
      const { quota, usage } = await storage.estimate()

      return new StorageSpace(quota, usage, isPersistent)
    } catch {
      return StorageSpace.unknown(isPersistent)
    }
  }

  /**
   * Asks the browser to keep the data of the origin under storage pressure. The browser may show a prompt or decide
   * on its own.
   *
   * @returns whether the data is persistent now
   */
  public async persist(): Promise<boolean> {
    try {
      return (await StorageSupport.resolveFor(this.environment)?.persist?.()) ?? false
    } catch {
      return false
    }
  }

  private async isPersistent(): Promise<boolean> {
    try {
      return (await StorageSupport.resolveFor(this.environment)?.persisted?.()) ?? false
    } catch {
      return false
    }
  }
}
