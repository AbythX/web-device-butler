import { describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import type { BroadcastChannelLike } from '../coordination/channel/broadcast-channel-like.ts'
import { BrowserEnvironment, type BrowserGlobals } from './browser-environment.ts'
import { UnsupportedError } from '../errors/unsupported-error.ts'

describe('browser-environment', () => {
  test('should not resolve the globals on construction', async () => {
    const resolveGlobals = vi.fn(() => ({}))

    const sut = new BrowserEnvironment(resolveGlobals)

    expect(sut).toBeInstanceOf(BrowserEnvironment)
    expect(resolveGlobals).not.toHaveBeenCalled()
  })

  test('should resolve the globals on every access', async () => {
    const globals: { navigator?: Navigator } = {}
    const sut = new BrowserEnvironment(() => globals)
    expect(() => sut.navigator).toThrowError(UnsupportedError)

    globals.navigator = mock<Navigator>()

    expect(sut.navigator).toBe(globals.navigator)
  })

  test('should return the provided globals', async () => {
    const globals = { window: mock<Window>(), navigator: mock<Navigator>(), document: mock<Document>() }
    const sut = BrowserEnvironment.of(globals)

    expect(sut.window).toBe(globals.window)
    expect(sut.navigator).toBe(globals.navigator)
    expect(sut.document).toBe(globals.document)
  })

  test.each(['window', 'navigator', 'document'] as const)('should throw if there is no %s', async (name) => {
    const sut = BrowserEnvironment.of({})

    expect(() => sut[name]).toThrowError(UnsupportedError)
    expect(() => sut[name]).toThrowError(expect.objectContaining({ feature: name }))
  })

  describe('#browser', () => {
    test('should read from the global scope', async () => {
      const navigator = mock<Navigator>()
      vi.stubGlobal('navigator', navigator)

      try {
        expect(BrowserEnvironment.browser().navigator).toBe(navigator)
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })

  describe('#isBrowser', () => {
    test.each<[boolean, BrowserGlobals]>([
      [true, { window: mock<Window>(), document: mock<Document>() }],
      [false, { window: mock<Window>() }],
      [false, { document: mock<Document>() }],
      [false, {}],
    ])('should be %s for the globals %#', async (expected, globals) => {
      expect(BrowserEnvironment.of(globals).isBrowser).toBe(expected)
    })
  })

  describe('#locks', () => {
    test('should return the lock manager of the navigator', async () => {
      const navigator = mock<Navigator>()

      expect(BrowserEnvironment.of({ navigator }).locks).toBe(navigator.locks)
    })

    test('should be undefined without a navigator or without Web Locks', async () => {
      expect(BrowserEnvironment.of({}).locks).toBeUndefined()
      expect(BrowserEnvironment.of({ navigator: {} as Navigator }).locks).toBeUndefined()
    })
  })

  describe('#mediaDevices', () => {
    test('should return the media devices of the navigator', async () => {
      const navigator = mock<Navigator>()

      expect(BrowserEnvironment.of({ navigator }).mediaDevices).toBe(navigator.mediaDevices)
    })

    test('should be undefined without a navigator or without media devices', async () => {
      expect(BrowserEnvironment.of({}).mediaDevices).toBeUndefined()
      expect(BrowserEnvironment.of({ navigator: {} as Navigator }).mediaDevices).toBeUndefined()
    })
  })

  describe('#permissions', () => {
    test('should return the Permissions API of the navigator', async () => {
      const navigator = mock<Navigator>()

      expect(BrowserEnvironment.of({ navigator }).permissions).toBe(navigator.permissions)
    })

    test('should be undefined without a navigator or without the Permissions API', async () => {
      expect(BrowserEnvironment.of({}).permissions).toBeUndefined()
      expect(BrowserEnvironment.of({ navigator: {} as Navigator }).permissions).toBeUndefined()
    })
  })

  describe('#geolocation', () => {
    test('should return the geolocation of the navigator', async () => {
      const navigator = mock<Navigator>()

      expect(BrowserEnvironment.of({ navigator }).geolocation).toBe(navigator.geolocation)
    })

    test('should be undefined without a navigator or without geolocation', async () => {
      expect(BrowserEnvironment.of({}).geolocation).toBeUndefined()
      expect(BrowserEnvironment.of({ navigator: {} as Navigator }).geolocation).toBeUndefined()
    })
  })

  describe('#isSecureContext', () => {
    test('should only be false where the browser says so', async () => {
      expect(BrowserEnvironment.of({ isSecureContext: false }).isSecureContext).toBe(false)
      expect(BrowserEnvironment.of({ isSecureContext: true }).isSecureContext).toBe(true)
      expect(BrowserEnvironment.of({}).isSecureContext).toBe(true)
    })
  })

  describe('#secured', () => {
    test('should return the api in a secure context', async () => {
      const api = {}

      expect(BrowserEnvironment.of({ isSecureContext: true }).secured(api)).toBe(api)
      expect(BrowserEnvironment.of({}).secured(api)).toBe(api)
    })

    test('should be undefined outside a secure context', async () => {
      expect(BrowserEnvironment.of({ isSecureContext: false }).secured({})).toBeUndefined()
    })

    test('should be undefined without the api', async () => {
      expect(BrowserEnvironment.of({ isSecureContext: true }).secured(undefined)).toBeUndefined()
    })
  })

  describe('#openBroadcastChannel', () => {
    test('should construct a channel with the name', async () => {
      const BroadcastChannel = vi.fn(function (this: { name: string }, name: string) {
        this.name = name
      }) as unknown as new (name: string) => BroadcastChannelLike

      const channel = BrowserEnvironment.of({ BroadcastChannel }).openBroadcastChannel('my-channel')

      expect(channel).toBeInstanceOf(BroadcastChannel)
      expect(channel).toEqual({ name: 'my-channel' })
    })

    test('should return undefined without BroadcastChannel', async () => {
      expect(BrowserEnvironment.of({}).openBroadcastChannel('my-channel')).toBeUndefined()
    })
  })
})
