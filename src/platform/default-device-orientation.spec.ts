import { beforeEach, describe, expect, test, vi } from 'vitest'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import { ScreenError } from '../screen/errors/screen-error.ts'
import type { DeviceOrientation, OrientationKind } from './device-orientation.ts'
import { DefaultDeviceOrientation } from './default-device-orientation.ts'

/** a page that can be turned */
class FakeWindow {
  public isPortrait = true
  public readonly queries: string[] = []
  public readonly listeners = new Set<(event: { matches: boolean }) => void>()

  public readonly matchMedia = (query: string): MediaQueryList => {
    this.queries.push(query)

    const list = {
      addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) =>
        this.listeners.add(listener),
      removeEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) =>
        this.listeners.delete(listener),
    }

    // read on every access, like the list of a browser
    Object.defineProperty(list, 'matches', { get: () => this.isPortrait })

    return list as unknown as MediaQueryList
  }

  public turn(): void {
    this.isPortrait = !this.isPortrait
    ;[...this.listeners].forEach((listener) => listener({ matches: this.isPortrait }))
  }
}

describe('default-device-orientation', () => {
  let page!: FakeWindow
  let sut!: DeviceOrientation

  const orientationOf = (globals: object) =>
    new DefaultDeviceOrientation(BrowserEnvironment.of(globals), new NullLogger())

  beforeEach(() => {
    page = new FakeWindow()
    sut = orientationOf({ window: page, document: {} })
  })

  describe('#current', () => {
    test('should tell how the device is held', async () => {
      expect(sut.current).toBe('portrait')
      expect(sut.isPortrait).toBe(true)
      expect(sut.isLandscape).toBe(false)
      expect(page.queries).toContain('(orientation: portrait)')
    })

    test('should follow the device without a listener', async () => {
      page.turn()

      expect(sut.current).toBe('landscape')
      expect(sut.isPortrait).toBe(false)
      expect(sut.isLandscape).toBe(true)
    })

    test.each([
      ['there is no page', {}],
      ['the browser cannot match media', { window: {}, document: {} }],
    ])('should not know where %s', async (_name, globals) => {
      const orientation = orientationOf(globals)

      expect(orientation.current).toBeUndefined()
      expect(orientation.isPortrait).toBe(false)
      expect(orientation.isLandscape).toBe(false)
    })
  })

  describe('change', () => {
    test('should announce when the device is turned', async () => {
      const changes: OrientationKind[] = []
      sut.on('change', (orientation) => changes.push(orientation))

      page.turn()
      page.turn()

      expect(changes).toEqual(['landscape', 'portrait'])
    })

    test('should only watch the page while someone listens', async () => {
      expect(page.listeners.size).toBe(0)

      const first = sut.on('change', () => undefined)
      const second = sut.on('change', () => undefined)
      expect(page.listeners.size).toBe(1)

      first.unsubscribe()
      expect(page.listeners.size).toBe(1)
      second.unsubscribe()
      expect(page.listeners.size).toBe(0)
    })

    test('should accept a listener where there is no page', async () => {
      const orientation = orientationOf({})

      expect(() => orientation.on('change', () => undefined).unsubscribe()).not.toThrow()
    })
  })

  describe('#lock', () => {
    const screenOf = (orientation: object) => ({ window: { screen: { orientation } }, document: {} })

    test('should keep the page the way it is asked for', async () => {
      const lock = vi.fn(async () => undefined)
      const orientation = orientationOf(screenOf({ lock }))

      await orientation.lock('landscape')

      expect(orientation.canLock).toBe(true)
      expect(lock).toHaveBeenCalledExactlyOnceWith('landscape')
    })

    test.each([
      ['there is no page', {}],
      ['the browser cannot keep the page from turning', screenOf({})],
    ])('should not be able to where %s', async (_name, globals) => {
      const orientation = orientationOf(globals)

      expect(orientation.canLock).toBe(false)
      await expect(orientation.lock('portrait')).rejects.toThrow(UnsupportedError)
    })

    test('should say that a device that cannot be turned does not support it', async () => {
      const refusal = Object.assign(new Error('no'), { name: 'NotSupportedError' })
      const orientation = orientationOf(screenOf({ lock: () => Promise.reject(refusal) }))

      const failure = await orientation.lock('portrait').catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(UnsupportedError)
      expect(failure).toHaveProperty('cause', refusal)
    })

    test('should report a refusal of the browser', async () => {
      const refusal = Object.assign(new Error('not fullscreen'), { name: 'SecurityError' })
      const orientation = orientationOf(screenOf({ lock: () => Promise.reject(refusal) }))

      const failure = await orientation.lock('portrait').catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(ScreenError)
      expect(failure).toHaveProperty('cause', refusal)
    })
  })

  describe('#unlock', () => {
    test('should let the page turn again', async () => {
      const unlock = vi.fn()

      orientationOf({ window: { screen: { orientation: { unlock } } }, document: {} }).unlock()

      expect(unlock).toHaveBeenCalledOnce()
    })

    test('should do nothing where the browser cannot keep the page from turning', async () => {
      expect(() => orientationOf({}).unlock()).not.toThrow()
    })

    test('should not fail where the browser refuses', async () => {
      const unlock = vi.fn(() => {
        throw new Error('no')
      })

      expect(() =>
        orientationOf({ window: { screen: { orientation: { unlock } } }, document: {} }).unlock()
      ).not.toThrow()
    })
  })

  describe('#dispose', () => {
    test('should stop watching and forget every listener', async () => {
      const changes: OrientationKind[] = []
      sut.on('change', (orientation) => changes.push(orientation))

      sut.dispose()
      page.turn()

      expect(page.listeners.size).toBe(0)
      expect(changes).toEqual([])
    })
  })
})
