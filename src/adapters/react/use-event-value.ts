import { useCallback, useSyncExternalStore } from 'react'

import type { EventSubscription } from '../../core/events/event-subscription.ts'

/**
 * A part of the library that announces with an event that one of its values changed.
 */
export interface ChangeAnnouncer<Type extends string> {
  on(type: Type, listener: () => void): EventSubscription
}

/**
 * A value of a part of the library that announces its changes with an event, as state of a component.
 *
 * @param read called on every render; returns the same value as long as nothing changed
 * @param server what is rendered where there is no browser, as during server-side rendering
 */
export const useEventValue = <Type extends string, Value>(
  source: ChangeAnnouncer<Type>,
  type: Type,
  read: () => Value,
  server: Value
): Value => {
  const subscribe = useCallback(
    (changed: () => void) => {
      const subscription = source.on(type, changed)

      return () => subscription.unsubscribe()
    },
    [source, type]
  )

  return useSyncExternalStore(subscribe, read, () => server)
}
