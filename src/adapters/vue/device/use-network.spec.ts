import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'
import { DefaultDeviceNetwork } from '../../../network/default-device-network.ts'
import { useNetwork } from './use-network.ts'

class FakeConnection extends FakeEventTarget {
  public type = 'wifi'
}

describe('use-network', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  test('should follow whether the device has a network and what kind', async () => {
    const page = new FakeEventTarget()
    const connection = new FakeConnection()
    const navigator = { onLine: true, connection }

    const network = new DefaultDeviceNetwork(
      BrowserEnvironment.of({ window: page, document: {}, navigator } as object),
      new NullLogger()
    )

    const state = within(() => useNetwork(network))
    expect(state.isOnline.value).toBe(true)
    expect(state.connection.value?.type).toBe('wifi')

    navigator.onLine = false
    page.dispatch('offline')
    connection.type = 'cellular'
    connection.dispatch('change')

    expect(state.isOnline.value).toBe(false)
    expect(state.connection.value?.type).toBe('cellular')

    scope.stop()
    expect(page.listenerCount()).toBe(0)
    expect(connection.listenerCount()).toBe(0)
  })

  test('should not know where there is no browser', async () => {
    const network = new DefaultDeviceNetwork(BrowserEnvironment.of({}), new NullLogger())

    const state = within(() => useNetwork(network))

    expect(state.isOnline.value).toBeUndefined()
    expect(state.connection.value).toBeUndefined()
  })
})
