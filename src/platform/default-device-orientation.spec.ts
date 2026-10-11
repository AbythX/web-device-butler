import { beforeEach, describe, expect, test } from 'vitest'

import { DeviceEnvironment } from '../core/environment/device-environment.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
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
    new DefaultDeviceOrientation(DeviceEnvironment.of(globals), new NullLogger())

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
