import { describe, expect, test } from 'vitest'
import { effectScope, watch } from 'vue'

import { StateController } from '../state/state-controller.ts'
import { useController } from './use-controller.ts'

class Pair extends StateController<{ left: number; right: number }> {
  public deactivations = 0

  public constructor() {
    super({ left: 0, right: 0 })
  }

  public moveLeft(): void {
    this.change({ left: this.read().left + 1 })
  }

  protected override onDeactivate(): void {
    this.deactivations++
  }
}

describe('use-controller', () => {
  test('should set only the refs of the fields that changed', async () => {
    const pair = new Pair()
    const scope = effectScope()
    const changed: string[] = []

    const refs = scope.run(() => {
      const bound = useController(pair)
      watch(bound.left, () => changed.push('left'), { flush: 'sync' })
      watch(bound.right, () => changed.push('right'), { flush: 'sync' })

      return bound
    })

    pair.moveLeft()

    expect(refs?.left.value).toBe(1)
    expect(refs?.right.value).toBe(0)
    expect(changed).toEqual(['left'])

    scope.stop()
  })

  test('should deactivate the controller and stop following it when the scope ends', async () => {
    const pair = new Pair()
    const scope = effectScope()
    const refs = scope.run(() => useController(pair))

    scope.stop()
    pair.moveLeft()

    expect(pair.deactivations).toBe(1)
    expect(refs?.left.value).toBe(0)
  })
})
