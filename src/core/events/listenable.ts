import type { EventSubscription } from './event-subscription.ts'

export type EventListener<Payload> = (payload: Payload) => void

/**
 * Something that announces events. `Events` maps each event name to the payload its listeners receive.
 */
export interface Listenable<Events extends object> {
  /**
   * Calls the listener every time the event is emitted. A listener that is registered twice is still called once
   * per event, and stays until both registrations are gone.
   *
   * @returns the subscription that removes this registration
   */
  on<Type extends keyof Events>(type: Type, listener: EventListener<Events[Type]>): EventSubscription

  /**
   * Calls the listener the next time the event is emitted and never again.
   *
   * @returns the subscription that removes the listener before the event came
   */
  once<Type extends keyof Events>(type: Type, listener: EventListener<Events[Type]>): EventSubscription

  /**
   * Removes the listener, however often it was registered.
   */
  off<Type extends keyof Events>(type: Type, listener: EventListener<Events[Type]>): void
}
