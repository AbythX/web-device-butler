export type { Codec } from './codecs/codec.ts'

export { BinaryCodec } from './codecs/binary-codec.ts'

export { JsonCodec } from './codecs/json-codec.ts'

export type { JsonCodecOptions } from './codecs/json-codec.ts'

export { TextCodec } from './codecs/text-codec.ts'

export { IndexedDbStorageDriver } from './drivers/indexed-db/indexed-db-storage-driver.ts'

export { MemoryStorageDriver } from './drivers/memory/memory-storage-driver.ts'

export { OpfsStorageDriver } from './drivers/opfs/opfs-storage-driver.ts'

export { StorageDriver } from './drivers/storage-driver.ts'

export { LocalStorageDriver } from './drivers/web/local-storage-driver.ts'

export { SessionStorageDriver } from './drivers/web/session-storage-driver.ts'

export { WebStorageDriver } from './drivers/web/web-storage-driver.ts'

export { StorageAccessDeniedError } from './errors/storage-access-denied-error.ts'

export { StorageCodecError } from './errors/storage-codec-error.ts'

export { StorageError } from './errors/storage-error.ts'

export { StorageLockedError } from './errors/storage-locked-error.ts'

export { StorageQuotaExceededError } from './errors/storage-quota-exceeded-error.ts'

export { StorageUnsupportedError } from './errors/storage-unsupported-error.ts'

export { StorageVersionError } from './errors/storage-version-error.ts'

export { StorageSpace } from './space/storage-space.ts'

export type {
  StorageSpaceWatch,
  StorageSpaceWatchEvents,
  StorageSpaceWatchOptions,
} from './space/storage-space-watch.ts'

export { DefaultStorageSpaceWatch } from './space/default-storage-space-watch.ts'

export { StorageCapabilities } from './storage-capabilities.ts'

export type { StoragePersistence } from './storage-capabilities.ts'

export type { StorageConfiguration } from './storage-configuration.ts'

export type { StorageManager, StoreOptions } from './storage-manager.ts'

export { DefaultStorageManager } from './default-storage-manager.ts'

export type { LockedEntry } from './store/locked-entry.ts'

export { DefaultLockedEntry } from './store/default-locked-entry.ts'

export type { Store, StoreEvents, StoreSetOptions, StoreWriteOptions } from './store/store.ts'

export { DefaultStore } from './store/default-store.ts'

export type { StoreChange } from './store/store-change.ts'
