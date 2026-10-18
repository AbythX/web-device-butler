import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

import type { StateController } from '../state/state-controller.ts'

/**
 * A controller for the lifetime of the component: created once, deactivated when the component is unmounted and
 * activated again when React mounts it again, as its strict mode does.
 */
export const useController = <Controller extends StateController<object>>(create: () => Controller): Controller => {
  const [controller] = useState(create)

  useEffect(() => {
    controller.activate()

    return () => controller.deactivate()
  }, [controller])

  return controller
}

/**
 * The state of a controller, rendered again after every change.
 */
export const useSnapshot = <Snapshot extends object>(controller: StateController<Snapshot>): Snapshot =>
  useSyncExternalStore(controller.subscribe, controller.read, controller.read)

/**
 * The value of the latest render, for a controller that is created once but has to use what the component was given
 * last.
 */
export const useLatest = <Value>(value: Value): RefObject<Value> => {
  const latest = useRef(value)
  latest.current = value

  return latest
}
