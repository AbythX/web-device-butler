import { afterEach, describe, expect, test } from 'vitest'

import { DefaultDeviceButler } from '../core/default-device-butler.ts'
import type { DeviceButler } from '../core/device-butler.ts'

/**
 * These specs run in real browsers, with the storage, the locks and the network state the browser really has.
 */
const waitFor = async (condition: () => boolean | Promise<boolean>) => {
  for (let attempt = 0; attempt < 300 && !(await condition()); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('the outbox in a real browser', () => {
  const butlers: DeviceButler[] = []

  /** a butler the way a page creates it; a second one stands for the page being opened again */
  const openPage = () => {
    const butler = DefaultDeviceButler.create({ storage: { namespace: 'outbox-spec' } })
    butlers.push(butler)

    return butler
  }

  afterEach(async () => {
    await Promise.all(butlers.splice(0).map((butler) => butler.dispose()))
  })

  test('should say that the device of the specs has a network', async () => {
    const butler = openPage()

    expect(butler.network.isOnline).toBe(true)
    expect(() => butler.network.on('change', () => undefined).unsubscribe()).not.toThrow()
    expect(['object', 'undefined']).toContain(typeof butler.network.connection)
  })

  test('should send what it is given, in order', async () => {
    const sent: string[] = []
    const namespace = `in-order-${crypto.randomUUID()}`
    const outbox = await openPage().outbox.open<string>({ namespace, send: async (item) => void sent.push(item) })

    await outbox.add('first')
    await outbox.add('second')
    await outbox.add('third')
    // an item is taken out a moment after it was sent
    await waitFor(async () => sent.length === 3 && (await outbox.entries()).length === 0)

    expect(sent).toEqual(['first', 'second', 'third'])
    expect(await outbox.entries()).toEqual([])
  })

  test('should keep what could not be sent for the next time the page is opened', async () => {
    const namespace = `kept-${crypto.randomUUID()}`

    const first = await openPage().outbox.open<string>({
      namespace,
      retryDelay: 60_000,
      send: () => Promise.reject(new Error('the server is down')),
    })

    const entry = await first.add('left behind')
    await waitFor(async () => (await first.entries())[0]?.attempts === 1)
    await butlers[0]?.dispose()

    // the page is opened again, and the server is back
    const sent: { item: string; id: string; attempt: number }[] = []

    const second = await openPage().outbox.open<string>({
      namespace,
      send: async (item, { id, attempt }) => void sent.push({ item, id, attempt }),
    })

    await waitFor(async () => sent.length === 1 && (await second.entries()).length === 0)

    expect(sent).toEqual([{ item: 'left behind', id: entry.id, attempt: 2 }])
    expect(await second.entries()).toEqual([])
  })
})
