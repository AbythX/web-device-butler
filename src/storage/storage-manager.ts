import type { Codec } from './codecs/codec.ts'
import type { StorageDriver } from './drivers/storage-driver.ts'
import type { StorageSpace } from './space/storage-space.ts'
import type { StorageSpaceWatch, StorageSpaceWatchOptions } from './space/storage-space-watch.ts'
import type { Store } from './store/store.ts'

export interface StoreOptions<T> {
  /**
   * `local`, `session`, `opfs`, `indexeddb`, `memory` or the name of a registered driver. A list is a fallback
   * chain: the first driver that is supported in this browser is used.
   */
  driver: string | readonly string[]
  /** entries of different namespaces never see each other, even on the same driver */
  namespace: string
  /** how values are turned into what the driver holds; default: JSON */
  codec?: Codec<T>
}

/**
 * The entry to the storage module (`butler.storage`): opens stores, knows the drivers and reports the space of the
 * origin.
 */
export interface StorageManager extends Disposable {
  /**
   * Adds a backend, or replaces the one with the same name. Stores that are already open keep their driver.
   */
  register(driver: StorageDriver): void

  /**
   * Whether the driver can be used in this browser right now. `false` for a name that is not registered.
   */
  isSupported(driver: string): Promise<boolean>

  /**
   * Opens the store of a namespace. Opening the same namespace again gives a second object on the same data.
   *
   * @throws StorageUnsupportedError if none of the drivers is supported in this browser
   */
  open<T = unknown>(options: StoreOptions<T>): Promise<Store<T>>

  /**
   * How much room the origin has. Never rejects; where the browser gives no estimate, the result says so.
   */
  space(): Promise<StorageSpace>

  /**
   * Asks the browser not to evict the data of the origin under storage pressure.
   *
   * @returns whether the data is persistent now
   */
  persist(): Promise<boolean>

  /**
   * Watches the space of the origin until the returned object is disposed.
   */
  watchSpace(options?: StorageSpaceWatchOptions): StorageSpaceWatch

  /**
   * Stops every watch, forgets the listeners of the stores and closes what the drivers keep open. Stored data is
   * not touched.
   */
  dispose(): void
}
