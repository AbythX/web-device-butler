import { describe, expect, test, vi } from 'vitest'

import { FakeOrigin } from './fake-origin.ts'
import { FakeStorage } from './fake-storage.ts'

describe('fake-origin', () => {
  test('should share the locks, the localStorage and the permissions between its tabs', async () => {
    const sut = new FakeOrigin()

    const first = sut.openEnvironment()
    const second = sut.openEnvironment()

    expect(first.secureContext?.locks).toBe(sut.locks)
    expect(second.secureContext?.locks).toBe(sut.locks)
    expect(first.localStorage).toBe(second.localStorage)
    expect(first.permissions).toBe(sut.permissions)
  })

  test('should give every tab a sessionStorage of its own', async () => {
    const sut = new FakeOrigin()

    expect(sut.openEnvironment().sessionStorage).not.toBe(sut.openEnvironment().sessionStorage)
  })

  test('should carry a broadcast between the tabs of one origin, and not to another origin', async () => {
    const origin = new FakeOrigin()
    const other = new FakeOrigin()
    const received = vi.fn()
    const elsewhere = vi.fn()

    const listening = origin.openEnvironment().openBroadcastChannel('updates')
    const foreign = other.openEnvironment().openBroadcastChannel('updates')
    listening?.addEventListener('message', received)
    foreign?.addEventListener('message', elsewhere)

    origin.openEnvironment().openBroadcastChannel('updates')?.postMessage('changed')
    await new Promise((resolve) => setTimeout(resolve))

    expect(received).toHaveBeenCalledTimes(1)
    expect(elsewhere).not.toHaveBeenCalled()
  })

  test('should keep a localStorage it was given', async () => {
    const localStorage = new FakeStorage(10)

    expect(new FakeOrigin(localStorage).openEnvironment().localStorage).toBe(localStorage)
  })

  test('should merge the navigator of a part with the shared one', async () => {
    const sut = new FakeOrigin()
    const geolocation = {} as Geolocation

    const environment = sut.openEnvironment({ navigator: { geolocation } as Navigator })

    expect(environment.secureContext?.geolocation).toBe(geolocation)
    expect(environment.secureContext?.locks).toBe(sut.locks)
  })

  test('should let an override replace the navigator, as a browser without it', async () => {
    const sut = new FakeOrigin()

    const environment = sut.openEnvironment({}, { navigator: {} as Navigator })

    expect(environment.secureContext?.locks).toBeUndefined()
  })

  test('should end what the tabs opened once, when it is closed', async () => {
    const sut = new FakeOrigin()
    const end = vi.fn()
    sut.onClose(end)

    sut.close()
    sut.close()

    expect(end).toHaveBeenCalledTimes(1)
  })
})
