import { getCurrentScope, onScopeDispose } from 'vue'

import type { EventSubscription } from '../../core/events/event-subscription.ts'

/**
 * Runs `cleanup` when the scope of the component ends. Outside a scope, as in a test or a store, it does nothing and
 * the caller cleans up itself.
 */
export const onScopeEnd = (cleanup: () => void): void => {
  if (getCurrentScope() !== undefined) {
    onScopeDispose(cleanup)
  }
}

/**
 * Keeps a listener of a part of the library until the scope of the component ends:
 * `untilScopeEnd(network.on('change', …))`.
 */
export const untilScopeEnd = (subscription: EventSubscription): void => {
  onScopeEnd(() => subscription.unsubscribe())
}
