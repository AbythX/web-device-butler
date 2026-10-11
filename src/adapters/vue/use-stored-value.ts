import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'

import type { Store } from '../../storage/store/store.ts'

export interface UseStoredValue<T> {
  /** the stored value; `undefined` while it is loading and where there is no entry */
  readonly value: ShallowRef<T | undefined>
  /** `true` once the entry was read for the first time */
  readonly isLoaded: Ref<boolean>
  /** why the last read or write failed */
  readonly error: ShallowRef<unknown>
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
  const value = shallowRef<T>()
  const isLoaded = ref(false)
  const error = shallowRef<unknown>()

  /** reads that were overtaken by a later one are dropped */
  let latestRead = 0

  const attempt = async (work: () => Promise<unknown>): Promise<void> => {
    try {
      await work()
      error.value = undefined
    } catch (failure) {
      error.value = failure
    }
  }

  const load = (): Promise<void> =>
    attempt(async () => {
      const read = ++latestRead
      const stored = await store.get(key)

      if (read === latestRead) {
        value.value = stored
        isLoaded.value = true
      }
    })

  const subscription = store.on('change', (change) => {
    if (change.key === key) {
      void load()
    }
  })

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => subscription.unsubscribe())
  }

  void load()

  return {
    value,
    isLoaded,
    error,
    set: (next) => attempt(() => store.set(key, next)),
    update: (fn) => attempt(() => store.update(key, fn)),
    remove: () => attempt(() => store.delete(key)),
  }
}
