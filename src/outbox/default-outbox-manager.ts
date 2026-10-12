import '../core/disposable-polyfill.ts'

import { CrossTabLock } from '../core/coordination/lock/cross-tab-lock.ts'
import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import type { Logger } from '../core/logging/logger.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import { ScopedLogger } from '../core/logging/scoped-logger.ts'
import { DefaultDeviceNetwork } from '../network/default-device-network.ts'
import type { DeviceNetwork } from '../network/device-network.ts'
import { DefaultStorageManager } from '../storage/default-storage-manager.ts'
import type { StorageManager } from '../storage/storage-manager.ts'
import { DefaultOutbox } from './default-outbox.ts'
import type { Outbox, OutboxEntry, OutboxManager, OutboxOptions } from './outbox.ts'

/**
 * The implementation of {@link OutboxManager}.
 */
export class DefaultOutboxManager implements OutboxManager {
  /**
   * For applications that only use the outbox. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): OutboxManager {
    const storage = DefaultStorageManager.create({}, environment, logger)
    const network = new DefaultDeviceNetwork(environment, logger)

    return new DefaultOutboxManager(storage, CrossTabLock.create(environment, logger), network, logger, [
      storage,
      network,
    ])
  }

  private readonly outboxes = new Set<Disposable>()

  /**
   * @param storage where the items are kept
   * @param lock lets one tab at a time send
   * @param network tells when sending is worth a try
   * @param owned what is disposed together with the manager, because nobody else owns it
   */
  public constructor(
    private readonly storage: StorageManager,
    private readonly lock: CrossTabLock,
    private readonly network: DeviceNetwork,
    private readonly logger: Logger,
    private readonly owned: readonly Disposable[] = []
  ) {}

  public async open<T>(options: OutboxOptions<T>): Promise<Outbox<T>> {
    if (options.namespace.length === 0) {
      throw new TypeError('An outbox needs a namespace')
    }

    const store = await this.storage.open<OutboxEntry<T>>({
      namespace: `outbox-${options.namespace}`,
      // items that are lost with the page are not worth an outbox, and two tabs have to see the same list
      prefer: { persistence: 'origin', consistentAcrossTabs: true },
      ...options.storage,
    })

    const outbox = new DefaultOutbox(
      store,
      this.lock,
      this.network,
      options,
      new ScopedLogger(`Outbox(${options.namespace})`, this.logger)
    )

    this.outboxes.add(outbox)
    // what was left in it when the page was closed
    void outbox.flush()

    return outbox
  }

  public dispose(): void {
    for (const outbox of this.outboxes) {
      outbox[Symbol.dispose]()
    }

    this.outboxes.clear()
    this.owned.forEach((owned) => owned[Symbol.dispose]())
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }
}
