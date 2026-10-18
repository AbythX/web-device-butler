import { createElement, StrictMode } from 'react'
import { describe, expect, test } from 'vitest'

import { StateController } from '../state/state-controller.ts'
import { renderHook } from './testing/render-hook.ts'
import { useController, useSnapshot } from './use-controller.ts'

class Counter extends StateController<{ count: number }> {
  public readonly lifecycle: string[] = []

  public constructor() {
    super({ count: 0 })
  }

  public increment(): void {
    this.change({ count: this.read().count + 1 })
  }

  public override activate(): void {
    super.activate()
    this.lifecycle.push('activate')
  }

  protected override onDeactivate(): void {
    this.lifecycle.push('deactivate')
  }
}

describe('useController', () => {
  test('should render the state of the controller and deactivate it when unmounted', async () => {
    const hook = await renderHook(() => {
      const controller = useController(() => new Counter())

      return { controller, snapshot: useSnapshot(controller) }
    })

    const { controller } = hook.result.current

    await hook.act(() => controller.increment())
    expect(hook.result.current.snapshot.count).toBe(1)
    expect(hook.result.current.controller).toBe(controller)

    await hook.unmount()
    expect(controller.lifecycle).toEqual(['activate', 'deactivate'])
  })

  test('should activate the controller again when strict mode mounts the component again', async () => {
    const hook = await renderHook(
      () => useController(() => new Counter()),
      (component) => createElement(StrictMode, null, component)
    )

    const controller = hook.result.current

    expect(controller.lifecycle).toEqual(['activate', 'deactivate', 'activate'])

    await hook.unmount()
    expect(controller.lifecycle.at(-1)).toBe('deactivate')
  })
})
