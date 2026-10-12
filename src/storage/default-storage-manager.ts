import '../core/disposable-polyfill.ts'

import { CrossTabChannel } from '../core/coordination/channel/cross-tab-channel.ts'
import { CrossTabLock } from '../core/coordination/lock/cross-tab-lock.ts'
import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import type { Logger } from '../core/logging/logger.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import { ScopedLogger } from '../core/logging/scoped-logger.ts'
import { JsonCodec } from './codecs/json-codec.ts'
import { MemoryStorageDriver } from './drivers/memory/memory-storage-driver.ts'
import type { StorageDriver } from './drivers/storage-driver.ts'
import { LocalStorageDriver } from './drivers/web/local-storage-driver.ts'
import { SessionStorageDriver } from './drivers/web/session-storage-driver.ts'
import { StorageUnsupportedError } from './errors/storage-unsupported-error.ts'
import type { StorageSpace } from './space/storage-space.ts'
import { StorageSpaceReader } from './space/storage-space-reader.ts'
import type { StorageSpaceWatch, StorageSpaceWatchOptions } from './space/storage-space-watch.ts'
import { DefaultStorageSpaceWatch } from './space/default-storage-space-watch.ts'
import type { StorageConfiguration } from './storage-configuration.ts'
import { DefaultStore } from './store/default-store.ts'
import type { Store } from './store/store.ts'
import type { StorageMessages } from './store/store-change.ts'
import { StoreChangeHub } from './store/store-change-hub.ts'
import type { StorageManager, StoreOptions } from './storage-manager.ts'

/**
 * The implementation of {@link StorageManager}.
 */
export class DefaultStorageManager implements StorageManager {
  private static readonly defaultNamespace = 'web-device-butler'

  /**
   * For applications that only use the storage module. Otherwise the manager is reached through `DeviceButler`.
   */
  public static create(
    configuration: StorageConfiguration = {},
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): StorageManager {
    const lock = CrossTabLock.create(environment, logger)
    const channel = CrossTabChannel.create<StorageMessages>(environment, logger)

    return new DefaultStorageManager(configuration, environment, lock, channel, logger, CrossTabLock.inTab(), true)
  }

  private readonly drivers = new Map<string, StorageDriver>()
  /**
   * Drivers whose code is only loaded when a store asks for them, so an application that never does, or that only
   * uses the camera, does not carry it.
   */
  private readonly loaders = new Map<string, () => Promise<StorageDriver>>()
  private readonly loading = new Map<string, Promise<StorageDriver>>()
  private readonly support = new Map<StorageDriver, Promise<boolean>>()
  private readonly watches = new Set<StorageSpaceWatch>()

  private readonly changes: StoreChangeHub
  private readonly spaceReader: StorageSpaceReader

  /**
   * @param lock coordinates access to data that is shared by the tabs of the origin
   * @param inTabLock coordinates access to data that only this tab sees
   * @param ownsChannel whether the channel is closed together with the manager
   */
  public constructor(
    private readonly configuration: StorageConfiguration,
    environment: BrowserEnvironment,
    private readonly lock: CrossTabLock,
    private readonly channel: CrossTabChannel<StorageMessages>,
    private readonly logger: Logger,
    private readonly inTabLock: CrossTabLock = CrossTabLock.inTab(),
    private readonly ownsChannel = false
  ) {
    this.changes = new StoreChangeHub(channel, new ScopedLogger('StoreChangeHub', logger))
    this.spaceReader = new StorageSpaceReader(environment)

    this.register(new LocalStorageDriver(environment))
    this.register(new SessionStorageDriver(environment))
    this.register(new MemoryStorageDriver())

    this.loaders.set('opfs', async () => {
      const { OpfsStorageDriver } = await import('./drivers/opfs/opfs-storage-driver.ts')

      return new OpfsStorageDriver(environment)
    })
    this.loaders.set('indexeddb', async () => {
      const { IndexedDbStorageDriver } = await import('./drivers/indexed-db/indexed-db-storage-driver.ts')

      return new IndexedDbStorageDriver(environment)
    })
  }

  public register(driver: StorageDriver): void {
    this.loaders.delete(driver.name)
    this.loading.delete(driver.name)
    this.drivers.set(driver.name, driver)
  }

  public async isSupported(driver: string): Promise<boolean> {
    try {
      const registered = await this.driverOf(driver)

      return registered === undefined ? false : await this.isDriverSupported(registered)
    } catch {
      return false
    }
  }

  public async open<T = unknown>(options: StoreOptions<T>): Promise<Store<T>> {
    if (options.namespace.length === 0) {
      throw new TypeError('A store needs a namespace')
    }

    const driver = await this.selectDriver(typeof options.driver === 'string' ? [options.driver] : options.driver)
    const scope = `${this.applicationScope}.${options.namespace}`

    return new DefaultStore<T>(
      options.namespace,
      scope,
      driver,
      options.codec ?? new JsonCodec<T>(),
      // data that is not shared between tabs must not be locked across them
      driver.capabilities.persistence === 'origin' ? this.lock : this.inTabLock,
      this.changes,
      this.spaceReader,
      new ScopedLogger(`Store(${options.namespace})`, this.logger)
    )
  }

  public space(): Promise<StorageSpace> {
    return this.spaceReader.read()
  }

  public persist(): Promise<boolean> {
    return this.spaceReader.persist()
  }

  public watchSpace(options: StorageSpaceWatchOptions = {}): StorageSpaceWatch {
    const watch = new DefaultStorageSpaceWatch(
      this.spaceReader,
      options,
      (listener) => this.changes.onRemoteWrite(listener),
      new ScopedLogger('StorageSpaceWatch', this.logger),
      (disposed) => this.watches.delete(disposed)
    )

    this.watches.add(watch)

    return watch
  }

  public dispose(): void {
    for (const watch of [...this.watches]) {
      watch.dispose()
    }

    this.changes.dispose()

    for (const driver of this.drivers.values()) {
      void driver
        .close()
        .catch((error: unknown) => this.logger.debug(`Could not close the storage driver '${driver.name}'`, error))
    }

    if (this.ownsChannel) {
      this.channel.close()
    }
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  /**
   * The namespace of the application as the prefix of a scope. Its dots are escaped, so the first dot of a scope
   * always ends it: `a.b` with the store `c` is not `a` with the store `b.c`.
   */
  private get applicationScope(): string {
    const namespace = this.configuration.namespace ?? DefaultStorageManager.defaultNamespace

    return namespace.replaceAll('%', '%25').replaceAll('.', '%2E')
  }

  private async selectDriver(names: readonly string[]): Promise<StorageDriver> {
    for (const name of names) {
      if (!this.drivers.has(name) && !this.loaders.has(name)) {
        // a name that is not registered is a mistake in the code, not a property of the browser
        throw new TypeError(`There is no storage driver with the name '${name}'`)
      }

      if (await this.isSupported(name)) {
        const driver = this.drivers.get(name)

        if (driver !== undefined) {
          return driver
        }
      }

      this.logger.debug(`The storage driver '${name}' is not supported in this browser`)
    }

    throw new StorageUnsupportedError(`None of the storage drivers is supported in this browser: ${names.join(', ')}`)
  }

  /**
   * The driver of the name, loaded if it was not needed before.
   *
   * @returns `undefined` for a name that is not registered
   */
  private async driverOf(name: string): Promise<StorageDriver | undefined> {
    const loader = this.loaders.get(name)

    if (loader === undefined) {
      return this.drivers.get(name)
    }

    let loading = this.loading.get(name)

    if (loading === undefined) {
      loading = loader()
      this.loading.set(name, loading)
      // code that could not be loaded, for example without a connection, is asked for again next time
      loading.catch(() => this.loading.delete(name))
    }

    const driver = await loading

    // unless a driver was registered under the name in the meantime
    if (this.loaders.get(name) === loader) {
      this.register(driver)
    }

    return this.drivers.get(name)
  }

  private isDriverSupported(driver: StorageDriver): Promise<boolean> {
    let supported = this.support.get(driver)

    if (supported === undefined) {
      supported = driver.isSupported().catch(() => false)
      this.support.set(driver, supported)

      // only a yes is kept: a backend that failed once, for example while it was blocked, is asked again
      void supported.then((isSupported) => {
        if (!isSupported) {
          this.support.delete(driver)
        }
      })
    }

    return supported
  }
}
