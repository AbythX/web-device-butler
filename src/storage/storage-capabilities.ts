export type StoragePersistence = 'page' | 'tab' | 'origin'

/**
 * What a backend can do. Immutable.
 */
export class StorageCapabilities {
  /** `local`, `session`, `opfs`, `indexeddb`, `memory` or the name of a custom driver */
  public readonly driver: string
  /** how long the data lives: until the page is left, until the tab is closed, or with the origin */
  public readonly persistence: StoragePersistence
  /** stores bytes as they are, without base64 */
  public readonly binary: boolean
  /** entries can be read and written as streams, without holding the whole value in memory */
  public readonly streaming: boolean
  /** changes made in another tab are reported as `change` events */
  public readonly crossTabEvents: boolean
  /**
   * A tab reads what another tab wrote as soon as the write has returned. `false` for `localStorage`: Firefox and
   * Safari pass a write on to the other tabs with a delay, so `update()` and `lock()` can, rarely, work on a value
   * that another tab has just replaced. Data that has to survive concurrent updates of several tabs belongs in a
   * driver for which this is `true`.
   */
  public readonly consistentAcrossTabs: boolean

  public constructor(capabilities: {
    driver: string
    persistence: StoragePersistence
    binary: boolean
    streaming: boolean
    /** default: `true` */
    consistentAcrossTabs?: boolean
  }) {
    this.driver = capabilities.driver
    this.persistence = capabilities.persistence
    this.binary = capabilities.binary
    this.streaming = capabilities.streaming
    // only data that is shared between tabs can change in another tab
    this.crossTabEvents = capabilities.persistence === 'origin'
    this.consistentAcrossTabs = capabilities.consistentAcrossTabs ?? true

    Object.freeze(this)
  }
}
