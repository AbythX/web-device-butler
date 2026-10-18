import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { StorageSupport } from '../../storage/storage-support.ts'
import type { DevicePermissionState } from '../permission-state.ts'
import type { PermissionRequester } from './permission-requester.ts'

/**
 * Asks the browser not to evict the data of the origin. Most browsers decide that without asking the user.
 */
export class PersistentStoragePermissionRequester implements PermissionRequester {
  public constructor(private readonly environment: BrowserEnvironment) {}

  /**
   * `false` outside a secure context and where the browser cannot be asked to keep the storage.
   */
  public get isSupported(): boolean {
    return StorageSupport.canPersistIn(this.environment)
  }

  /**
   * Asks the browser to keep the storage of the origin. Most browsers decide without a prompt.
   *
   * @returns `granted` if the storage is persistent now, otherwise `undefined`: a refusal is not final
   */
  public async request(): Promise<DevicePermissionState | undefined> {
    const isPersistent = await StorageSupport.resolveFor(this.environment)?.persist?.()

    return isPersistent ? 'granted' : undefined
  }

  /**
   * @returns `granted` if the storage is persistent already, otherwise `undefined`
   */
  public async query(): Promise<DevicePermissionState | undefined> {
    const isPersistent = await StorageSupport.resolveFor(this.environment)?.persisted?.()

    return isPersistent ? 'granted' : undefined
  }
}
