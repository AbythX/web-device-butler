import { useCallback, useEffect, useRef, useState } from 'react'

import type { Store } from '../../../storage/store/store.ts'

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
  const [value, setValue] = useState<T>()
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<unknown>()
  /** reads that were overtaken by a later one are dropped */
  const latestRead = useRef(0)

  const attempt = useCallback(async (work: () => Promise<unknown>): Promise<void> => {
    try {
      await work()
      setError(undefined)
    } catch (failure) {
      setError(failure)
    }
  }, [])

  const load = useCallback(
    (): Promise<void> =>
      attempt(async () => {
        const read = ++latestRead.current
        const stored = await store.get(key)

        if (read === latestRead.current) {
          setValue(stored)
          setIsLoaded(true)
        }
      }),
    [attempt, store, key]
  )

  useEffect(() => {
    const subscription = store.on('change', (change) => {
      if (change.key === key) {
        void load()
      }
    })

    void load()

    return () => {
      subscription.unsubscribe()
      // a read that is on its way belongs to an entry this component no longer shows
      latestRead.current++
    }
  }, [store, key, load])

  const set = useCallback((next: T) => attempt(() => store.set(key, next)), [attempt, store, key])

  const update = useCallback(
    (fn: (current: T | undefined) => T) => attempt(() => store.update(key, fn)),
    [attempt, store, key]
  )

  const remove = useCallback(() => attempt(() => store.delete(key)), [attempt, store, key])

  return { value, isLoaded, error, set, update, remove }
}
