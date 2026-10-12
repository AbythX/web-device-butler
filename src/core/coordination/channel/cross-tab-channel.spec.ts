import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { type MockProxy, mock } from 'vitest-mock-extended'

import type { BroadcastChannelLike } from './broadcast-channel-like.ts'
import { CrossTabChannel } from './cross-tab-channel.ts'
import { BrowserEnvironment } from '../../environment/browser-environment.ts'
import { InTabBroadcastChannel } from './in-tab-broadcast-channel.ts'
import type { Logger } from '../../logging/logger.ts'

interface TestMessages {
  'store-changed': { key: string }
  'camera-released': undefined
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

describe('cross-tab-channel', () => {
  let logger!: MockProxy<Logger>
  let opened!: InTabBroadcastChannel[]
  let environment!: BrowserEnvironment
  let channels!: CrossTabChannel<TestMessages>[]

  /** a channel as a tab of a browser with BroadcastChannel would create it */
  const createForTab = (name = 'cross-tab-channel.spec') => {
    const channel = new CrossTabChannel<TestMessages>(name, environment, logger)
    channels.push(channel)

    return channel
  }

  beforeEach(() => {
    logger = mock<Logger>()
    opened = []
    channels = []

    class RecordingBroadcastChannel extends InTabBroadcastChannel {
      public constructor(name: string) {
        super(name)
        opened.push(this)
      }
    }

    environment = BrowserEnvironment.of({ BroadcastChannel: RecordingBroadcastChannel })
  })

  afterEach(() => {
    channels.forEach((channel) => channel.close())
  })

  test('should not open a broadcast channel on construction', async () => {
    createForTab()

    expect(opened).toHaveLength(0)
  })

  test('should open the broadcast channel once, with its name, when it is first used', async () => {
    const sut = createForTab('my-channel')

    sut.on('store-changed', vi.fn())
    sut.on('camera-released', vi.fn())
    sut.post('camera-released', undefined)

    expect(opened.map((channel) => channel.name)).toEqual(['my-channel'])
  })

  test('should deliver a message to the listeners of its type in another tab', async () => {
    const sender = createForTab()
    const receiver = createForTab()
    const onStoreChanged = vi.fn()
    const onCameraReleased = vi.fn()
    receiver.on('store-changed', onStoreChanged)
    receiver.on('camera-released', onCameraReleased)

    sender.post('store-changed', { key: 'settings' })
    await flush()

    expect(onStoreChanged).toHaveBeenCalledExactlyOnceWith({ key: 'settings' })
    expect(onCameraReleased).not.toHaveBeenCalled()
  })

  test('should report a failing listener to the logger and still call the others', async () => {
    const sender = createForTab()
    const receiver = createForTab()
    const onStoreChanged = vi.fn()
    receiver.on('store-changed', () => {
      throw new Error('listener failed')
    })
    receiver.on('store-changed', onStoreChanged)

    sender.post('store-changed', { key: 'settings' })
    await flush()

    expect(onStoreChanged).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  test('should not deliver a message to the channel it was posted on', async () => {
    const sut = createForTab()
    const listener = vi.fn()
    sut.on('store-changed', listener)

    sut.post('store-changed', { key: 'settings' })
    await flush()

    expect(listener).not.toHaveBeenCalled()
  })

  test('should not deliver messages of a channel with another name', async () => {
    const receiver = createForTab('first')
    const listener = vi.fn()
    receiver.on('store-changed', listener)

    createForTab('second').post('store-changed', { key: 'settings' })
    await flush()

    expect(listener).not.toHaveBeenCalled()
  })

  test.each([undefined, null, 'text', 42, {}, { type: 42 }, { payload: {} }])(
    'should ignore the foreign message %j',
    async (message) => {
      const sut = createForTab()
      const listener = vi.fn()
      sut.on('store-changed', listener)
      sut.on('camera-released', listener)

      new InTabBroadcastChannel('cross-tab-channel.spec').postMessage(message)
      await flush()

      expect(listener).not.toHaveBeenCalled()
    }
  )

  describe('#close', () => {
    test('should close the broadcast channel and stop delivering messages', async () => {
      const sender = createForTab()
      const sut = createForTab()
      const listener = vi.fn()
      sut.on('store-changed', listener)
      const close = vi.spyOn(opened[0]!, 'close')

      sut.close()
      sender.post('store-changed', { key: 'settings' })
      await flush()

      expect(close).toHaveBeenCalled()
      expect(listener).not.toHaveBeenCalled()
    })

    test('should neither post nor reopen once it is closed', async () => {
      const receiver = createForTab()
      const listener = vi.fn()
      receiver.on('store-changed', listener)
      const sut = createForTab()

      sut.close()
      sut.post('store-changed', { key: 'settings' })
      sut.on('store-changed', vi.fn())
      await flush()

      expect(listener).not.toHaveBeenCalled()
      expect(opened).toHaveLength(1)
    })

    test('should not open a broadcast channel if it was never used', async () => {
      createForTab().close()

      expect(opened).toHaveLength(0)
    })

    test('should close when it is disposed', async () => {
      const sender = createForTab()
      const listener = vi.fn()
      {
        using sut = createForTab()
        sut.on('store-changed', listener)
      }

      sender.post('store-changed', { key: 'settings' })
      await flush()

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('without BroadcastChannel', () => {
    beforeEach(() => {
      environment = BrowserEnvironment.of({})
    })

    test('should still deliver messages between the channels inside the tab', async () => {
      const sender = createForTab()
      const receiver = createForTab()
      const listener = vi.fn()
      receiver.on('store-changed', listener)

      sender.post('store-changed', { key: 'settings' })
      await flush()

      expect(listener).toHaveBeenCalledExactlyOnceWith({ key: 'settings' })
    })

    test('should log the limitation once per channel', async () => {
      const sut = createForTab()
      expect(logger.warn).not.toHaveBeenCalled()

      sut.on('store-changed', vi.fn())
      sut.post('camera-released', undefined)

      expect(logger.warn).toHaveBeenCalledTimes(1)
    })
  })

  test('should deliver messages through the BroadcastChannel of the runtime', async () => {
    environment = BrowserEnvironment.browser()
    const sender = createForTab()
    const receiver = createForTab()

    const received = new Promise((resolve) => receiver.on('store-changed', resolve))
    sender.post('store-changed', { key: 'settings' })

    expect(await received).toEqual({ key: 'settings' })
  })

  test('should use the broadcast channel of the environment', async () => {
    const broadcastChannel = mock<BroadcastChannelLike>()
    environment = BrowserEnvironment.of({
      BroadcastChannel: class {
        public constructor() {
          return broadcastChannel
        }
      } as unknown as new (name: string) => BroadcastChannelLike,
    })
    const sut = createForTab()

    sut.post('store-changed', { key: 'settings' })

    expect(broadcastChannel.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'store-changed',
      payload: { key: 'settings' },
    })
  })
})
