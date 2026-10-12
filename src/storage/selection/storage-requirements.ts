import type { StoragePersistence } from '../storage-capabilities.ts'

/**
 * What can be asked of the backend of a store. The same shape says what the backend must have (`require`) and what
 * it should have (`prefer`). A field that is not set, or set to `false`, asks for nothing.
 */
export interface StorageTraits {
  /**
   * How long the data lives: until the page is left, until the tab is closed, or with the origin. Exactly this:
   * `tab` does not take a backend that outlives the tab.
   */
  persistence?: StoragePersistence
  /** stores bytes as they are, without base64 */
  binary?: boolean
  /** entries can be read and written as streams */
  streaming?: boolean
  /** changes made in another tab are reported as `change` events */
  crossTabEvents?: boolean
  /** a tab reads what another tab wrote as soon as the write has returned */
  consistentAcrossTabs?: boolean
  /**
   * The browser has promised not to evict the data of the origin under storage pressure. The promise is asked for
   * when the store is opened, which can show a prompt in some browsers. Only a backend that keeps its data with the
   * origin can have it.
   */
  persistent?: boolean
}

/**
 * Which backend a store is kept in. The same shape is part of the `storage` section of the configuration (the
 * defaults) and of the options of `open()` (the overrides for one call).
 */
export interface StorageRequirements {
  /**
   * The backends to choose from, by name: `local`, `session`, `opfs`, `indexeddb`, `memory` or the name of a
   * registered driver. A list is also the order in which they are tried. Without it every registered backend is a
   * candidate.
   */
  driver?: string | readonly string[]
  /** a backend without these is never used */
  require?: StorageTraits
  /** among the backends that have what is required, those with these are ranked higher */
  prefer?: StorageTraits
}
