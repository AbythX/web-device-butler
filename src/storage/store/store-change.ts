/**
 * One change of a store.
 */
export interface StoreChange {
  readonly type: 'set' | 'delete'
  readonly key: string
  /** `local`: made in this tab, by this store or another one on the same data. `remote`: made in another tab. */
  readonly origin: 'local' | 'remote'
}

/**
 * What the stores send to the other tabs.
 */
export interface StorageMessages {
  'store-change': {
    driver: string
    namespace: string
    key: string
    type: StoreChange['type']
  }
}
