import { beforeEach, describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import { FakeEventTarget } from '../core/testing/fake-event-target.ts'
import type { DeviceNetwork, NetworkConnection } from './device-network.ts'
import { DefaultDeviceNetwork } from './default-device-network.ts'

class FakeConnection extends FakeEventTarget {
  public type: unknown = 'wifi'
  public effectiveType: unknown = '4g'
  public downlink: unknown = 10
  public rtt: unknown = 50
  public saveData: unknown = false
}

describe('default-device-network', () => {
  let page!: FakeEventTarget
  let connection!: FakeConnection
  let navigator!: { onLine: boolean; connection?: FakeConnection }
  let sut!: DeviceNetwork

  const networkOf = (globals: object) => new DefaultDeviceNetwork(BrowserEnvironment.of(globals), new NullLogger())

  beforeEach(() => {
    page = new FakeEventTarget()
    connection = new FakeConnection()
    navigator = { onLine: true, connection }
    sut = networkOf({ window: page, document: {}, navigator })
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      expect(() => DefaultDeviceNetwork.create()).not.toThrow()
    })
  })

  describe('#isOnline', () => {
    test('should tell whether the device has a network', async () => {
      expect(sut.isOnline).toBe(true)

      navigator.onLine = false

      expect(sut.isOnline).toBe(false)
    })

    test('should not know where there is no browser', async () => {
      expect(networkOf({}).isOnline).toBeUndefined()
    })
  })

  describe('#connection', () => {
    test('should tell what the browser says about the connection', async () => {
      expect(sut.connection).toEqual({
        type: 'wifi',
        effectiveType: '4g',
        downlink: 10,
        roundTripTime: 50,
        saveData: false,
      })
    })

    test('should leave out what the browser reports in another shape', async () => {
      connection.type = undefined
      connection.downlink = 'fast'

      expect(sut.connection).toEqual({
        type: undefined,
        effectiveType: '4g',
        downlink: undefined,
        roundTripTime: 50,
        saveData: false,
      })
    })

    test('should not know where the browser does not say', async () => {
      navigator.connection = undefined

      expect(sut.connection).toBeUndefined()
    })
  })

  describe('change', () => {
    test('should announce when the device loses its network and gets it back', async () => {
      const changes: boolean[] = []
      sut.on('change', (isOnline) => changes.push(isOnline))

      navigator.onLine = false
      page.dispatch('offline')
      navigator.onLine = true
      page.dispatch('online')

      expect(changes).toEqual([false, true])
    })

    test('should only watch the page while someone listens', async () => {
      expect(page.listenerCount()).toBe(0)

      const subscription = sut.on('change', () => undefined)
      expect(page.listenerCount()).toBe(2)

      subscription.unsubscribe()
      expect(page.listenerCount()).toBe(0)
    })

    test('should accept a listener where there is no page', async () => {
      const network = networkOf({})

      expect(() => network.on('change', () => undefined).unsubscribe()).not.toThrow()
    })
  })

  describe('connectionchange', () => {
    test('should announce another kind of connection', async () => {
      const changes: NetworkConnection[] = []
      sut.on('connectionchange', (changed) => changes.push(changed))

      connection.type = 'cellular'
      connection.dispatch('change')

      expect(changes).toHaveLength(1)
      expect(changes[0]?.type).toBe('cellular')
    })

    test('should accept a listener where the browser does not say', async () => {
      navigator.connection = undefined

      expect(() => sut.on('connectionchange', () => undefined).unsubscribe()).not.toThrow()
    })
  })

  describe('#dispose', () => {
    test('should stop watching and forget every listener', async () => {
      const changes: boolean[] = []
      sut.on('change', (isOnline) => changes.push(isOnline))
      sut.on('connectionchange', () => changes.push(true))

      sut.dispose()
      page.dispatch('offline')
      connection.dispatch('change')

      expect(page.listenerCount()).toBe(0)
      expect(connection.listenerCount()).toBe(0)
      expect(changes).toEqual([])
    })
  })
})
