import type { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import type { StorageDriver } from '../drivers/storage-driver.ts'
import type { StorageMessages, StoreChange } from './store-change.ts'

type StoreChangeListener = (change: StoreChange) => void

/**
 * Distributes the changes of the stores: to the other stores on the same data inside this tab, and, for data that
 * is shared between tabs, to the other tabs. The same event therefore behaves the same for every backend.
 */
export class StoreChangeHub {
  /**
   * How long a backend that is not consistent across tabs gets to pass a write on, in milliseconds; 4 were enough
   * in every measurement, 0 were not.
   */
  public static readonly settleTime = 5

  private readonly listeners = new Map<StorageDriver, Map<string, Set<StoreChangeListener>>>()
  private readonly remoteWriteListeners = new Set<() => void>()
  private channelSubscription: EventSubscription | undefined

  public constructor(
    private readonly channel: CrossTabChannel<StorageMessages>,
    private readonly logger: Logger
  ) {}

  /**
   * Registers a listener for the changes of one namespace of one driver, no matter where they were made.
   */
  public subscribe(driver: StorageDriver, namespace: string, listener: StoreChangeListener): EventSubscription {
    const listeners = this.listenersOf(driver, namespace)
    listeners.add(listener)
    this.listenToOtherTabs()

    return new EventSubscription(() => {
      listeners.delete(listener)
      this.forgetIfEmpty(driver, namespace)
    })
  }

  /**
   * Registers a listener that is called whenever another tab announced a write to any store.
   */
  public onRemoteWrite(listener: () => void): EventSubscription {
    this.remoteWriteListeners.add(listener)
    this.listenToOtherTabs()

    return new EventSubscription(() => this.remoteWriteListeners.delete(listener))
  }

  /**
   * Announces a change that a store of this tab made.
   */
  public publish(driver: StorageDriver, namespace: string, type: StoreChange['type'], key: string): void {
    this.notify(this.listeners.get(driver)?.get(namespace), { type, key, origin: 'local' })

    if (driver.capabilities.crossTabEvents) {
      this.channel.post('store-change', { driver: driver.name, namespace, key, type })
    }
  }

  /**
   * Stops listening to the other tabs and forgets every listener.
   */
  public dispose(): void {
    this.channelSubscription?.unsubscribe()
    this.channelSubscription = undefined
    this.listeners.clear()
    this.remoteWriteListeners.clear()
  }

  private listenToOtherTabs(): void {
    this.channelSubscription ??= this.channel.on('store-change', this.receive)
  }

  private readonly receive = (message: StorageMessages['store-change']): void => {
    // a tab that runs another version of the application may send something else under this name
    if (
      typeof message?.driver !== 'string' ||
      typeof message.namespace !== 'string' ||
      typeof message.key !== 'string' ||
      (message.type !== 'set' && message.type !== 'delete')
    ) {
      this.logger.debug('Ignored a change with an unknown format', message)

      return
    }

    this.notify(this.remoteWriteListeners, undefined)

    for (const driver of this.listeners.keys()) {
      if (driver.name !== message.driver) {
        continue
      }

      const announce = () =>
        this.notify(this.listeners.get(driver)?.get(message.namespace), {
          type: message.type,
          key: message.key,
          origin: 'remote',
        })

      if (driver.capabilities.consistentAcrossTabs) {
        announce()
      } else {
        // the announcement can overtake the write it is about; a listener that reads at once would see the old value
        setTimeout(announce, StoreChangeHub.settleTime)
      }
    }
  }

  /**
   * A failing listener must neither fail the write that caused the change nor keep the change from the others.
   */
  private notify<Payload>(listeners: Iterable<(payload: Payload) => void> | undefined, payload: Payload): void {
    for (const listener of [...(listeners ?? [])]) {
      try {
        listener(payload)
      } catch (error) {
        this.logger.error('A listener of a store change failed', error)
      }
    }
  }

  private forgetIfEmpty(driver: StorageDriver, namespace: string): void {
    const namespaces = this.listeners.get(driver)

    if (namespaces?.get(namespace)?.size === 0) {
      namespaces.delete(namespace)
    }

    if (namespaces?.size === 0) {
      this.listeners.delete(driver)
    }
  }

  private listenersOf(driver: StorageDriver, namespace: string): Set<StoreChangeListener> {
    let namespaces = this.listeners.get(driver)

    if (namespaces === undefined) {
      namespaces = new Map()
      this.listeners.set(driver, namespaces)
    }

    let listeners = namespaces.get(namespace)

    if (listeners === undefined) {
      listeners = new Set()
      namespaces.set(namespace, listeners)
    }

    return listeners
  }
}
