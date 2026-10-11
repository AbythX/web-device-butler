import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

import { InTabBroadcastChannel } from '../../core/coordination/channel/in-tab-broadcast-channel.ts'
import { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import { CrossTabLock } from '../../core/coordination/lock/cross-tab-lock.ts'
import { InTabLockManager } from '../../core/coordination/lock/in-tab-lock-manager.ts'
import { DeviceEnvironment, type DeviceGlobals } from '../../core/environment/device-environment.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import type { StorageConfiguration } from '../storage-configuration.ts'
import { DefaultStorageManager } from '../default-storage-manager.ts'
import type { StorageManager } from '../storage-manager.ts'
import { FakeFileSystemDirectory } from './fake-file-system.ts'
import { FakeStorage } from './fake-storage.ts'

/**
 * One origin in one browser, for specs: every tab opened from it shares the locks, the `localStorage`, the file
 * system, the databases and the broadcast channels, and has its own `sessionStorage`.
 */
export class FakeBrowser {
  private static instances = 0

  public readonly locks = new InTabLockManager()
  public readonly localStorage: FakeStorage
  public readonly fileSystem = new FakeFileSystemDirectory()
  public readonly indexedDB = new IDBFactory()
  public readonly estimate = { quota: 1000, usage: 250 }
  public isPersistent = false

  private readonly managers: StorageManager[] = []
  // broadcast channels are global to the process, every fake browser needs its own
  private readonly channelPrefix = `fake-browser-${FakeBrowser.instances++}:`

  public constructor(
    private readonly sharedGlobals: Partial<DeviceGlobals> = {},
    localStorage = new FakeStorage()
  ) {
    this.localStorage = localStorage
  }

  public openEnvironment(): DeviceEnvironment {
    const channelPrefix = this.channelPrefix

    const navigator = {
      locks: this.locks,
      storage: {
        getDirectory: async () => this.fileSystem,
        estimate: async () => ({ ...this.estimate }),
        persisted: async () => this.isPersistent,
        persist: async () => {
          this.isPersistent = true

          return true
        },
      },
    } as unknown as Navigator

    return DeviceEnvironment.of({
      navigator,
      localStorage: this.localStorage,
      sessionStorage: new FakeStorage(),
      indexedDB: this.indexedDB,
      IDBKeyRange,
      BroadcastChannel: class extends InTabBroadcastChannel {
        public constructor(name: string) {
          super(channelPrefix + name)
        }
      },
      ...this.sharedGlobals,
    })
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

    this.managers.push(manager)

    return manager
  }

  public close(): void {
    this.managers.forEach((manager) => manager.dispose())
  }
}
