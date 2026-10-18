import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

import { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import { CrossTabLock } from '../../core/coordination/lock/cross-tab-lock.ts'
import { InTabLockManager } from '../../core/coordination/lock/in-tab-lock-manager.ts'
import type { BrowserEnvironment, BrowserGlobals } from '../../core/environment/browser-environment.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { FakeOrigin } from '../../core/testing/fake-origin.ts'
import type { FakeStorage } from '../../core/testing/fake-storage.ts'
import type { StorageConfiguration } from '../storage-configuration.ts'
import { DefaultStorageManager } from '../default-storage-manager.ts'
import type { StorageManager } from '../storage-manager.ts'
import { FakeFileSystemDirectory } from './fake-file-system.ts'

/**
 * The storage of one browser, for specs: every tab opened from it shares the file system, the databases and the
 * persistence, and the locks, the `localStorage` and the broadcast channels of its origin.
 */
export class FakeStorageBrowser {
  public readonly fileSystem = new FakeFileSystemDirectory()
  public readonly indexedDB = new IDBFactory()
  public readonly estimate = { quota: 1000, usage: 250 }
  public isPersistent = false

  public readonly locks: InTabLockManager
  public readonly localStorage: FakeStorage

  /**
   * @param globals what a spec changes in every tab; see {@link FakeOrigin.openEnvironment}
   * @param origin the origin of the tabs, shared with the fake of another part where a spec needs both
   */
  public constructor(
    private readonly globals: Partial<BrowserGlobals> = {},
    public readonly origin: FakeOrigin = new FakeOrigin()
  ) {
    this.locks = origin.locks
    this.localStorage = origin.localStorage
  }

  public openEnvironment(): BrowserEnvironment {
    const storage = {
      getDirectory: async () => this.fileSystem,
      estimate: async () => ({ ...this.estimate }),
      persisted: async () => this.isPersistent,
      persist: async () => {
        this.isPersistent = true

        return true
      },
    }

    return this.origin.openEnvironment(
      // SAFETY: only the calls of the storage manager that the library makes are faked
      { navigator: { storage } as unknown as Navigator, indexedDB: this.indexedDB, IDBKeyRange },
      this.globals
    )
  }

  /**
   * The storage manager of a new tab.
   */
  public openTab(configuration: StorageConfiguration = {}, logger: Logger = new NullLogger()): StorageManager {
    const environment = this.openEnvironment()

    const manager = new DefaultStorageManager(
      configuration,
      environment,
      new CrossTabLock(environment, logger),
      new CrossTabChannel(CrossTabChannel.defaultName, environment, logger),
      logger,
      // every tab is its own JavaScript realm: what is shared inside a tab is not shared between tabs
      CrossTabLock.inTab(new InTabLockManager()),
      true
    )

    this.origin.onClose(() => manager.dispose())

    return manager
  }

  /**
   * Closes every tab of the origin.
   */
  public close(): void {
    this.origin.close()
  }
}
