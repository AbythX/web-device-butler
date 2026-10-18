import { useEffect } from 'react'

import type { Store } from '../../../storage/store/store.ts'
import { StoredValueController } from '../../state/storage/stored-value-controller.ts'
import { useController, useSnapshot } from '../use-controller.ts'

export interface UseStoredValue<T> {
  /** the stored value; `undefined` while it is loading and where there is no entry */
  readonly value: T | undefined
  /** `true` once the entry was read for the first time */
  readonly isLoaded: boolean
  /** why the last read or write failed */
  readonly error: unknown
  /** writes the value; `value` follows once it is stored */
  set(value: T): Promise<void>
  /** builds on the current value, safely when several tabs do it at once */
  update(fn: (current: T | undefined) => T): Promise<void>
  /** removes the entry */
  remove(): Promise<void>
}

/**
 * One entry of a store as state of a component. It follows every change of the entry, also the ones other
 * components and other tabs make.
 *
 * Failures are not thrown, they end up in `error`.
 */
export const useStoredValue = <T>(store: Store<T>, key: string): UseStoredValue<T> => {
  const controller = useController(() => new StoredValueController<T>())

  // after the controller is activated, also again in strict mode
  useEffect(() => controller.select(store, key), [controller, store, key])

  return { ...useSnapshot(controller), set: controller.set, update: controller.update, remove: controller.remove }
}
