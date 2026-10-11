import type { Logger } from '../logging/logger.ts'
import { EventSubscription } from './event-subscription.ts'
import type { EventListener, Listenable } from './listenable.ts'

export type { EventListener } from './listenable.ts'

/**
 * The typed base class of everything that emits. `Events` maps each event name to the payload its listeners receive.
 */
export abstract class EventEmitter<Events extends object> implements Listenable<Events> {
  /** per listener how often it was registered: it is called once, and stays until every registration is gone */
  private readonly listeners: { [Type in keyof Events]?: Map<EventListener<Events[Type]>, number> } = {}

  public on<Type extends keyof Events>(type: Type, listener: EventListener<Events[Type]>): EventSubscription {
    const listeners = (this.listeners[type] ??= new Map())
    const isFirst = listeners.size === 0

    listeners.set(listener, (listeners.get(listener) ?? 0) + 1)

    if (isFirst) {
      this.onFirstListener(type)
    }

    return new EventSubscription(() => this.release(type, listener))
  }

  public once<Type extends keyof Events>(type: Type, listener: EventListener<Events[Type]>): EventSubscription {
    const subscription = this.on(type, (payload) => {
      subscription.unsubscribe()
      listener(payload)
    })

    return subscription
  }

  public off<Type extends keyof Events>(type: Type, listener: EventListener<Events[Type]>): void {
    const listeners = this.listeners[type]

    if (listeners?.delete(listener) && listeners.size === 0) {
      this.onLastListenerRemoved(type)
    }
  }

  /**
   * Every listener is called, even if an earlier one throws. The failures are rethrown afterwards, so a broken
   * listener stays visible without keeping the others from their event.
   */
  protected emit<Type extends keyof Events>(type: Type, payload: Events[Type]): void {
    const errors: unknown[] = []

    for (const listener of [...(this.listeners[type]?.keys() ?? [])]) {
      try {
        listener(payload)
      } catch (error) {
        errors.push(error)
      }
    }

    if (errors.length === 1) {
      throw errors[0]
    }

    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} listeners of '${String(type)}' failed`)
    }
  }

  /**
   * For events that are announced from inside an operation: a failing listener is reported to the logger and does
   * not fail the operation that caused the event.
   */
  protected emitSafely<Type extends keyof Events>(type: Type, payload: Events[Type], logger: Logger): void {
    try {
      this.emit(type, payload)
    } catch (error) {
      logger.error(`A listener of '${String(type)}' failed`, error)
    }
  }

  protected listenerCount(type: keyof Events): number {
    return this.listeners[type]?.size ?? 0
  }

  protected removeAllListeners(): void {
    // SAFETY: the only keys of listeners are the event names that on() put there
    for (const type of Object.keys(this.listeners) as (keyof Events)[]) {
      const listeners = this.listeners[type]

      if (listeners !== undefined && listeners.size > 0) {
        listeners.clear()
        this.onLastListenerRemoved(type)
      }
    }
  }

  /**
   * Takes back one registration of the listener.
   */
  private release<Type extends keyof Events>(type: Type, listener: EventListener<Events[Type]>): void {
    const listeners = this.listeners[type]
    const registrations = listeners?.get(listener)

    if (listeners !== undefined && registrations !== undefined && registrations > 1) {
      listeners.set(listener, registrations - 1)
    } else {
      this.off(type, listener)
    }
  }

  /**
   * Called when an event gets its first listener. Subclasses start the work that is only needed while someone
   * listens.
   */
  protected onFirstListener(_type: keyof Events): void {}

  /**
   * Called when the last listener of an event was removed.
   */
  protected onLastListenerRemoved(_type: keyof Events): void {}
}
