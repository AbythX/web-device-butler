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
import { StorageError } from './errors/storage-error.ts'
import { StorageUnsupportedError } from './errors/storage-unsupported-error.ts'
import { StorageDriverSelector, type StorageDriverCandidate } from './selection/storage-driver-selector.ts'
import type { StorageRequirements } from './selection/storage-requirements.ts'
import { StorageCapabilities } from './storage-capabilities.ts'
import type { StorageSpace } from './space/storage-space.ts'
import { StorageSpaceReader } from './space/storage-space-reader.ts'
import type { StorageSpaceWatch, StorageSpaceWatchOptions } from './space/storage-space-watch.ts'
import { DefaultStorageSpaceWatch } from './space/default-storage-space-watch.ts'
import type { StorageConfiguration } from './storage-configuration.ts'
import type { StoragePreparation } from './storage-preparation.ts'
import { DefaultStore } from './store/default-store.ts'
import type { Store } from './store/store.ts'
import type { StorageMessages } from './store/store-change.ts'
import { StoreChangeHub } from './store/store-change-hub.ts'
import type { StorageManager, StoreOptions } from './storage-manager.ts'

/**
 * A driver whose code is not loaded yet. What it can do is known beforehand, so choosing a backend by its traits
 * does not load the ones that are not chosen.
 */
interface StorageDriverLoader {
  readonly capabilities: StorageCapabilities
  load(): Promise<StorageDriver>
}

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
  private readonly loaders = new Map<string, StorageDriverLoader>()
  private readonly loading = new Map<string, Promise<StorageDriver>>()
  private readonly support = new Map<StorageDriver, Promise<boolean>>()
  private readonly watches = new Set<StorageSpaceWatch>()
  private readonly selector = new StorageDriverSelector()
  /** the promise of the browser not to evict the data, asked for once; a refusal is asked again */
  private persisting: Promise<boolean> | undefined

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

    this.loaders.set('opfs', {
      capabilities: StorageCapabilities.opfs,
      load: async () => {
        const { OpfsStorageDriver } = await import('./drivers/opfs/opfs-storage-driver.ts')

        return new OpfsStorageDriver(environment)
      },
    })
    this.loaders.set('indexeddb', {
      capabilities: StorageCapabilities.indexedDb,
      load: async () => {
        const { IndexedDbStorageDriver } = await import('./drivers/indexed-db/indexed-db-storage-driver.ts')

        return new IndexedDbStorageDriver(environment)
      },
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

    const driver = await this.selectDriver(this.requirementsOf(options))
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

  public async prepare(requirements: StorageRequirements = {}): Promise<StoragePreparation> {
    try {
      const { capabilities } = await this.selectDriver(this.requirementsOf(requirements))

      return { capabilities, isPersistent: (await this.spaceReader.read()).isPersistent }
    } catch (error) {
      if (!(error instanceof StorageError)) {
        throw error
      }

      return { isPersistent: (await this.spaceReader.read()).isPersistent, error }
    }
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

  /**
   * The requirements of a call. Each field replaces the one of the configuration as a whole.
   */
  private requirementsOf(requirements: StorageRequirements): StorageRequirements {
    return {
      driver: requirements.driver ?? this.configuration.driver,
      require: requirements.require ?? this.configuration.require,
      prefer: requirements.prefer ?? this.configuration.prefer,
    }
  }

  /**
   * The best backend that has what is required and works in this browser. The backends are asked whether they work
   * in the order of their ranking, so only the code of the chosen one, and of those ranked above it, is loaded.
   */
  private async selectDriver(requirements: StorageRequirements): Promise<StorageDriver> {
    let selection = this.selector.select(this.candidates(requirements.driver), requirements)

    for (const candidate of selection.ranked) {
      if (await this.isSupported(candidate.name)) {
        const driver = this.drivers.get(candidate.name)

        if (driver !== undefined) {
          await this.protect(requirements)

          return driver
        }
      }

      this.logger.debug(`The storage driver '${candidate.name}' is not supported in this browser`)
      selection = selection.without(candidate)
    }

    throw new StorageUnsupportedError(selection.explain())
  }

  /**
   * The backends a call chooses from: the ones it names, or every registered one.
   */
  private candidates(driver: StorageRequirements['driver']): StorageDriverCandidate[] {
    const names = typeof driver === 'string' ? [driver] : (driver ?? [...this.drivers.keys(), ...this.loaders.keys()])

    return names.map((name) => {
      const capabilities = this.drivers.get(name)?.capabilities ?? this.loaders.get(name)?.capabilities

      if (capabilities === undefined) {
        // a name that is not registered is a mistake in the code, not a property of the browser
        throw new TypeError(`There is no storage driver with the name '${name}'`)
      }

      return { name, capabilities }
    })
  }

  /**
   * Asks the browser for the protection against eviction the requirements name.
   *
   * @throws StorageUnsupportedError if it is required and the browser refuses
   */
  private async protect({ require = {}, prefer = {} }: StorageRequirements): Promise<void> {
    if (!require.persistent && !prefer.persistent) {
      return
    }

    this.persisting ??= this.spaceReader.persist()
    const isPersistent = await this.persisting

    if (isPersistent) {
      return
    }

    this.persisting = undefined

    if (require.persistent) {
      throw new StorageUnsupportedError('The browser does not protect the data of the origin against eviction')
    }

    this.logger.info('The browser does not protect the data of the origin against eviction')
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
      loading = loader.load()
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
