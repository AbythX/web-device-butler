import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { CrossTabLock } from '../core/coordination/lock/cross-tab-lock.ts'
import { InTabLockManager } from '../core/coordination/lock/in-tab-lock-manager.ts'
import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { EventEmitter } from '../core/events/event-emitter.ts'
import type { Logger } from '../core/logging/logger.ts'
import type { DeviceNetwork, DeviceNetworkEvents } from '../network/device-network.ts'
import { DefaultStorageManager } from '../storage/default-storage-manager.ts'
import type { StorageManager } from '../storage/storage-manager.ts'
import { DefaultOutboxManager } from './default-outbox-manager.ts'
import type { Outbox, OutboxEntry, OutboxFailure, OutboxSendContext } from './outbox.ts'

const waitFor = async (condition: () => boolean | Promise<boolean>) => {
  for (let attempt = 0; attempt < 500 && !(await condition()); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 20))

/** a device that gets a network and loses it */
class FakeNetwork extends EventEmitter<DeviceNetworkEvents> implements DeviceNetwork {
  public isOnline: boolean | undefined = true
  public readonly connection = undefined

  public go(isOnline: boolean): void {
    this.isOnline = isOnline
    this.emit('change', isOnline)
  }

  public get watchers(): number {
    return this.listenerCount('change')
  }

  public dispose(): void {
    this.removeAllListeners()
  }

  public [Symbol.dispose](): void {
    this.dispose()
  }
}

/** the server the items are sent to */
class FakeServer {
  public readonly received: string[] = []
  public readonly contexts: OutboxSendContext[] = []
  /** the items that are refused, and how often still */
  public readonly refusals = new Map<string, number>()
  /** how many items were on their way at the same time, at most */
  public mostAtOnce = 0
  /** holds every delivery back until it is released */
  public gate: Promise<void> | undefined
  private underway = 0

  public readonly send = async (item: string, context: OutboxSendContext): Promise<void> => {
    this.contexts.push(context)
    this.mostAtOnce = Math.max(this.mostAtOnce, ++this.underway)

    try {
      await this.gate

      const refusals = this.refusals.get(item) ?? 0

      if (refusals > 0) {
        this.refusals.set(item, refusals - 1)
        throw new Error(`refused ${item}`)
      }

      this.received.push(item)
    } finally {
      this.underway--
    }
  }
}

describe('default-outbox-manager', () => {
  let storage!: StorageManager
  let network!: FakeNetwork
  let server!: FakeServer
  let logger!: Logger
  let sut!: DefaultOutboxManager

  const open = (options: { maxAttempts?: number; retryDelay?: number | ((attempt: number) => number) } = {}) =>
    sut.open<string>({ namespace: 'uploads', send: server.send, retryDelay: 60_000, ...options })

  const waiting = async (outbox: Outbox<string>) => (await outbox.entries()).map(({ item }) => item)

  beforeEach(() => {
    const environment = BrowserEnvironment.of({})
    storage = DefaultStorageManager.create({}, environment)
    network = new FakeNetwork()
    server = new FakeServer()
    logger = mock<Logger>()
    sut = new DefaultOutboxManager(storage, CrossTabLock.inTab(new InTabLockManager()), network, logger)
  })

  afterEach(() => {
    sut.dispose()
    storage.dispose()
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      using manager = DefaultOutboxManager.create()
      const sent: string[] = []

      const outbox = await manager.open<string>({ namespace: 'uploads', send: async (item) => void sent.push(item) })
      await outbox.add('first')
      await waitFor(() => sent.length === 1)

      expect(sent).toEqual(['first'])
    })
  })

  describe('#open', () => {
    test('should refuse an outbox without a namespace', async () => {
      await expect(sut.open({ namespace: '', send: server.send })).rejects.toThrow(TypeError)
    })

    test('should send what was left in the outbox when it was closed', async () => {
      network.isOnline = false
      const first = await open()
      await first.add('left behind')
      first.dispose()

      network.isOnline = true
      const second = await open()
      await waitFor(() => server.received.length === 1)

      expect(server.received).toEqual(['left behind'])
      expect(await waiting(second)).toEqual([])
    })
  })

  describe('#add', () => {
    test('should send the item and take it out', async () => {
      const outbox = await open()
      const sent: OutboxEntry<string>[] = []
      outbox.on('sent', (entry) => sent.push(entry))

      const entry = await outbox.add('photo')
      await waitFor(() => sent.length === 1)

      expect(server.received).toEqual(['photo'])
      expect(server.contexts[0]).toMatchObject({ id: entry.id, attempt: 1 })
      expect(sent[0]).toMatchObject({ id: entry.id, item: 'photo', attempts: 0 })
      expect(await waiting(outbox)).toEqual([])
    })

    test('should send the items one after another, in the order they were added', async () => {
      const outbox = await open()

      await Promise.all([outbox.add('first'), outbox.add('second'), outbox.add('third')])
      await waitFor(() => server.received.length === 3)

      expect(server.received).toEqual(['first', 'second', 'third'])
      expect(server.mostAtOnce).toBe(1)
    })

    test('should send what is added while it sends', async () => {
      let release!: () => void
      server.gate = new Promise((resolve) => (release = resolve))
      const outbox = await open()
      await outbox.add('first')
      await waitFor(() => outbox.isSending && server.contexts.length === 1)

      await outbox.add('second')
      release()
      await waitFor(() => server.received.length === 2)

      expect(server.received).toEqual(['first', 'second'])
    })
  })

  describe('a device without a network', () => {
    test('should keep the items and send them when the network returns', async () => {
      network.isOnline = false
      const outbox = await open()

      await outbox.add('first')
      await outbox.add('second')
      await settled()

      expect(server.contexts).toHaveLength(0)
      expect(await waiting(outbox)).toEqual(['first', 'second'])

      network.go(true)
      await waitFor(() => server.received.length === 2)

      expect(server.received).toEqual(['first', 'second'])
    })

    test('should try where the browser does not say whether there is a network', async () => {
      network.isOnline = undefined
      const outbox = await open()

      await outbox.add('first')
      await waitFor(() => server.received.length === 1)

      expect(server.received).toEqual(['first'])
    })
  })

  describe('an item that cannot be sent', () => {
    test('should keep it, note the failure and hold back the items after it', async () => {
      server.refusals.set('first', 1)
      const outbox = await open()
      const failures: OutboxFailure<string>[] = []
      outbox.on('failed', (failure) => failures.push(failure))

      await outbox.add('first')
      await outbox.add('second')
      await waitFor(() => failures.length === 1)
      await settled()

      expect(server.received).toEqual([])
      expect(failures[0]).toMatchObject({ willRetry: true, entry: { item: 'first', attempts: 1 } })
      expect(failures[0]?.error).toBeInstanceOf(Error)

      const [kept] = await outbox.entries()
      expect(kept).toMatchObject({ item: 'first', attempts: 1, lastError: 'Error: refused first' })
      expect(await waiting(outbox)).toEqual(['first', 'second'])
    })

    test('should try again after a while', async () => {
      server.refusals.set('first', 2)
      const delays: number[] = []

      const outbox = await open({
        retryDelay: (attempt) => {
          delays.push(attempt)

          return 5
        },
      })

      await outbox.add('first')
      await waitFor(() => server.received.length === 1)

      expect(delays).toEqual([1, 2])
      expect(server.contexts.map(({ attempt }) => attempt)).toEqual([1, 2, 3])
    })

    test('should try again when it is told to', async () => {
      server.refusals.set('first', 1)
      const outbox = await open()
      await outbox.add('first')
      await waitFor(() => server.contexts.length === 1 && !outbox.isSending)

      await outbox.flush()

      expect(server.received).toEqual(['first'])
      expect(outbox.isSending).toBe(false)
    })

    test('should try again when the network returns', async () => {
      server.refusals.set('first', 1)
      const outbox = await open()
      await outbox.add('first')
      await waitFor(() => server.contexts.length === 1 && !outbox.isSending)

      network.go(true)
      await waitFor(() => server.received.length === 1)

      expect(server.received).toEqual(['first'])
    })

    test('should give it up after the attempts it was allowed and go on with the next', async () => {
      server.refusals.set('first', 5)
      const outbox = await open({ maxAttempts: 2, retryDelay: 5 })
      const failures: OutboxFailure<string>[] = []
      outbox.on('failed', (failure) => failures.push(failure))

      await outbox.add('first')
      await outbox.add('second')
      await waitFor(() => server.received.length === 1)

      expect(server.received).toEqual(['second'])
      expect(failures.map(({ willRetry }) => willRetry)).toEqual([true, false])
      expect(await waiting(outbox)).toEqual([])
      expect(logger.warn).toHaveBeenCalledOnce()
    })
  })

  describe('#remove', () => {
    test('should take an item out without sending it', async () => {
      network.isOnline = false
      const outbox = await open()
      const { id } = await outbox.add('first')

      expect(await outbox.remove(id)).toBe(true)
      expect(await outbox.remove(id)).toBe(false)

      network.go(true)
      await settled()

      expect(server.contexts).toHaveLength(0)
    })
  })

  describe('several tabs', () => {
    test('should let one of them send at a time, which also sends what the other added', async () => {
      let release!: () => void
      server.gate = new Promise((resolve) => (release = resolve))
      const first = await open()
      const second = await open()

      await first.add('from the first')
      await waitFor(() => server.contexts.length === 1)
      await second.add('from the second')
      await second.flush()

      expect(second.isSending).toBe(false)
      expect(server.contexts).toHaveLength(1)

      release()
      await waitFor(() => server.received.length === 2)

      expect(server.received).toEqual(['from the first', 'from the second'])
      expect(server.mostAtOnce).toBe(1)
    })
  })

  describe('#dispose', () => {
    test('should stop sending and keep what waits', async () => {
      server.refusals.set('first', 1)
      const outbox = await open({ retryDelay: 5 })
      await outbox.add('first')
      await waitFor(() => server.contexts.length === 1 && !outbox.isSending)

      outbox.dispose()
      await settled()
      network.go(true)
      await settled()

      expect(server.contexts).toHaveLength(1)
      expect(server.contexts[0]?.signal.aborted).toBe(true)
      expect(await waiting(outbox)).toEqual(['first'])
    })

    test('should not report a delivery that fails because the outbox is gone', async () => {
      let release!: () => void
      server.gate = new Promise((resolve) => (release = resolve))
      server.refusals.set('first', 1)
      const outbox = await open()
      const failed = vi.fn()
      outbox.on('failed', failed)
      await outbox.add('first')
      await waitFor(() => server.contexts.length === 1)

      outbox.dispose()
      release()
      await settled()

      expect(failed).not.toHaveBeenCalled()
      expect((await outbox.entries())[0]?.attempts).toBe(0)
    })

    test('should dispose every outbox with the manager', async () => {
      await open()
      expect(network.watchers).toBe(1)

      sut.dispose()

      expect(network.watchers).toBe(0)
    })
  })
})
