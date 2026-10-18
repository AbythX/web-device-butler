import type { Store } from '../../../storage/store/store.ts'
import { StoredValueController, type StoredValueSnapshot } from '../../state/storage/stored-value-controller.ts'
import { type SnapshotRefs, useController } from '../use-controller.ts'

export interface UseStoredValue<T> extends SnapshotRefs<StoredValueSnapshot<T>> {
  /** writes the value; `value` follows once it is stored */
  set(value: T): Promise<void>
  /** builds on the current value, safely when several tabs do it at once */
  update(fn: (current: T | undefined) => T): Promise<void>
  /** removes the entry */
  remove(): Promise<void>
}

/**
 * One entry of a store as reactive state. It follows every change of the entry, also the ones other components and
 * other tabs make.
 *
 * Failures are not thrown, they end up in `error`.
 */
export const useStoredValue = <T>(store: Store<T>, key: string): UseStoredValue<T> => {
  const controller = new StoredValueController<T>()
  const refs = useController(controller)

  controller.select(store, key)

  return { ...refs, set: controller.set, update: controller.update, remove: controller.remove }
}
