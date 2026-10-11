import type { DeviceEnvironment } from '../../../core/environment/device-environment.ts'
import { StorageCapabilities } from '../../storage-capabilities.ts'
import { WebStorageDriver } from './web-storage-driver.ts'

/**
 * `sessionStorage`: small values that live as long as the tab and are not visible to other tabs.
 */
export class SessionStorageDriver extends WebStorageDriver {
  /** the name a store is opened with: `{ driver: 'session' }` */
  public readonly name: string = 'session'
  /** kept until the tab is closed and never shared with another tab, strings only */
  public readonly capabilities = new StorageCapabilities({
    driver: this.name,
    persistence: 'tab',
    binary: false,
    streaming: false,
  })

  public constructor(private readonly environment: DeviceEnvironment) {
    super()
  }

  protected get storage(): Storage | undefined {
    return this.environment.sessionStorage
  }
}
