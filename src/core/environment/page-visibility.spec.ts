import { describe, expect, test } from 'vitest'

import { DeviceEnvironment } from './device-environment.ts'
import { PageVisibility } from './page-visibility.ts'

class FakeDocument {
  public readonly listeners = new Set<() => void>()

  public constructor(public visibilityState: 'visible' | 'hidden') {}

  public addEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener)
  }

  public removeEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener)
  }

  public change(visibilityState: 'visible' | 'hidden'): void {
    this.visibilityState = visibilityState
    ;[...this.listeners].forEach((listener) => listener())
  }
}

const visibilityOf = (document: FakeDocument) =>
  new PageVisibility(DeviceEnvironment.of({ window: {} as Window, document: document as unknown as Document }))

const settled = async (promise: Promise<void>) => {
  let isSettled = false
  void promise.then(() => (isSettled = true))
  await new Promise((resolve) => setTimeout(resolve))

  return isSettled
}

describe('page-visibility', () => {
  describe('#isHidden', () => {
    test('should follow the page', async () => {
      const document = new FakeDocument('visible')
      const sut = visibilityOf(document)

      expect(sut.isHidden).toBe(false)
      document.change('hidden')
      expect(sut.isHidden).toBe(true)
    })

    test('should be false where there is no page', async () => {
      expect(new PageVisibility(DeviceEnvironment.of({})).isHidden).toBe(false)
    })
  })

  describe('#whenVisible', () => {
    test('should resolve at once for a page that is visible', async () => {
      const document = new FakeDocument('visible')

      expect(await settled(visibilityOf(document).whenVisible())).toBe(true)
      expect(document.listeners.size).toBe(0)
    })

    test('should resolve at once where there is no page', async () => {
      expect(await settled(new PageVisibility(DeviceEnvironment.of({})).whenVisible())).toBe(true)
    })

    test('should wait until the page is visible', async () => {
      const document = new FakeDocument('hidden')
      const waiting = visibilityOf(document).whenVisible()

      expect(await settled(waiting)).toBe(false)

      document.change('visible')
      expect(await settled(waiting)).toBe(true)
    })

    test('should keep waiting for a change that leaves the page hidden', async () => {
      const document = new FakeDocument('hidden')
      const waiting = visibilityOf(document).whenVisible()

      document.change('hidden')

      expect(await settled(waiting)).toBe(false)
    })

    test('should stop listening once the page is visible', async () => {
      const document = new FakeDocument('hidden')
      const waiting = visibilityOf(document).whenVisible()

      document.change('visible')
      await waiting

      expect(document.listeners.size).toBe(0)
    })
  })
})
