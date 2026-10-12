import type { Codec } from './codecs/codec.ts'
import type { StorageDriver } from './drivers/storage-driver.ts'
import type { StorageRequirements } from './selection/storage-requirements.ts'
import type { StorageSpace } from './space/storage-space.ts'
import type { StorageSpaceWatch, StorageSpaceWatchOptions } from './space/storage-space-watch.ts'
import type { StoragePreparation } from './storage-preparation.ts'
import type { Store } from './store/store.ts'

/**
 * What a store is opened with. `driver`, `require` and `prefer` say which backend it is kept in; each of them
 * replaces the one of the configuration as a whole. With none of them, here or in the configuration, the library
 * chooses among every registered backend.
 */
export interface StoreOptions<T> extends StorageRequirements {
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
   * The backend is the best of those that have what is required and work in this browser: the one with the most of
   * what is preferred, then the first of `driver`, and without `driver` the one whose data lives longest.
   *
   * @throws StorageUnsupportedError if no backend has what is required and works in this browser, or the browser
   *   refuses the protection against eviction that is required. The message says what each backend lacks.
   */
  open<T = unknown>(options: StoreOptions<T>): Promise<Store<T>>

  /**
   * Does the choosing of `open()` up front, for a set-up screen: says which backend a store would be kept in and
   * asks for the protection against eviction that is required or preferred. Nothing is opened or written.
   *
   * It reports instead of throwing.
   *
   * @param requirements override the ones of the configuration for this call
   */
  prepare(requirements?: StorageRequirements): Promise<StoragePreparation>

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
