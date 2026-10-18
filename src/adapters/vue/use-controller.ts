import { shallowRef, type ShallowRef } from 'vue'

import type { StateController } from '../state/state-controller.ts'
import { onScopeEnd } from './scope.ts'

/**
 * Every field of a snapshot as a ref.
 */
export type SnapshotRefs<Snapshot> = { readonly [Field in keyof Snapshot]: ShallowRef<Snapshot[Field]> }

/**
 * The state of a controller as reactive state: one `shallowRef` per field. The controller is deactivated when the scope of the component ends.
 */
export const useController = <Snapshot extends object>(
  controller: StateController<Snapshot>
): SnapshotRefs<Snapshot> => {
  const initial = controller.read()
  // SAFETY: the keys of the snapshot are its own fields, the ones Object.keys returns
  const fields = Object.keys(initial) as (keyof Snapshot)[]
  // SAFETY: filled with one ref per field right below
  const refs = {} as { [Field in keyof Snapshot]: ShallowRef<Snapshot[Field]> }

  for (const field of fields) {
    refs[field] = shallowRef(initial[field])
  }

  const unsubscribe = controller.subscribe(() => {
    const snapshot = controller.read()

    // a ref that is set to the value it has does not trigger anything
    for (const field of fields) {
      refs[field].value = snapshot[field]
    }
  })

  onScopeEnd(() => {
    unsubscribe()
    controller.deactivate()
  })

  return refs
}
