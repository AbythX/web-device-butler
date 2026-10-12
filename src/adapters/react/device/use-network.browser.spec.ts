import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'
import { DefaultDeviceNetwork } from '../../../network/default-device-network.ts'
import { renderHook } from '../testing/render-hook.ts'
import { useNetwork } from './use-network.ts'

describe('useNetwork', () => {
  test('should follow whether the device has a network and what kind', async () => {
    const page = new FakeEventTarget()
    const connection = Object.assign(new FakeEventTarget(), { type: 'wifi' })
    const navigator = { onLine: true, connection }

    const network = new DefaultDeviceNetwork(
      BrowserEnvironment.of({ window: page, document: {}, navigator } as object),
      new NullLogger()
    )

    const hook = await renderHook(() => useNetwork(network))
    expect(hook.result.current.isOnline).toBe(true)
    expect(hook.result.current.connection?.type).toBe('wifi')

    await hook.act(() => {
      navigator.onLine = false
      page.dispatch('offline')
      connection.type = 'cellular'
      connection.dispatch('change')
    })

    expect(hook.result.current.isOnline).toBe(false)
    expect(hook.result.current.connection?.type).toBe('cellular')

    await hook.unmount()
    expect(page.listenerCount()).toBe(0)
    expect(connection.listenerCount()).toBe(0)
  })
})
