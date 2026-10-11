import type { DeviceEnvironment } from '../../../core/environment/device-environment.ts'
import { StorageCapabilities } from '../../storage-capabilities.ts'
import { WebStorageDriver } from './web-storage-driver.ts'

/**
 * `localStorage`: small values that persist and are shared by every tab of the origin.
 *
 * The tabs do not see each other's writes at once, see `capabilities.consistentAcrossTabs`.
 */
export class LocalStorageDriver extends WebStorageDriver {
  /** the name a store is opened with: `{ driver: 'local' }` */
  public readonly name: string = 'local'
  /** kept with the origin, strings only, not consistent across tabs */
  public readonly capabilities = new StorageCapabilities({
    driver: this.name,
    persistence: 'origin',
    binary: false,
    streaming: false,
    // a write reaches the other tabs with a delay in Firefox and Safari
    consistentAcrossTabs: false,
  })

  public constructor(private readonly environment: DeviceEnvironment) {
    super()
  }

  protected get storage(): Storage | undefined {
    return this.environment.localStorage
  }
}
