import { beforeEach, describe, expect, test, vi } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../core/testing/fake-event-target.ts'
import { ScreenError } from '../errors/screen-error.ts'
import { DefaultScreenFullscreen } from './default-screen-fullscreen.ts'

/** a document whose calls are the standard ones, or the ones older browsers have under a prefix */
class FakeDocument extends FakeEventTarget {
  public fullscreenElement: object | null = null
  public webkitFullscreenElement: object | null = null
  public exitFullscreen: (() => Promise<void>) | undefined
  public webkitExitFullscreen: (() => void) | undefined

  public constructor(private readonly isPrefixed = false) {
    super()

    if (isPrefixed) {
      this.webkitExitFullscreen = () => this.show(null)
    } else {
      this.exitFullscreen = async () => this.show(null)
    }
  }

  public show(element: object | null): void {
    if (this.isPrefixed) {
      this.webkitFullscreenElement = element
      this.dispatch('webkitfullscreenchange')
    } else {
      this.fullscreenElement = element
      this.dispatch('fullscreenchange')
    }
  }

  /** an element that can fill the screen */
  public createElement(): Element {
    const element = this.isPrefixed
      ? { webkitRequestFullscreen: vi.fn(() => this.show(element)) }
      : { requestFullscreen: vi.fn(async () => this.show(element)) }

    return element as unknown as Element
  }
}

/** a video on a phone that fills the screen with videos only */
class FakeVideo extends FakeEventTarget {
  public webkitDisplayingFullscreen = false

  public webkitEnterFullscreen(): void {
    this.webkitDisplayingFullscreen = true
    this.dispatch('webkitbeginfullscreen')
  }

  public webkitExitFullscreen(): void {
    this.webkitDisplayingFullscreen = false
    this.dispatch('webkitendfullscreen')
  }
}

describe('default-screen-fullscreen', () => {
  let page!: FakeDocument
  let sut!: DefaultScreenFullscreen

  const fullscreenOf = (document: object | undefined) => {
    const globals: object = document === undefined ? {} : { window: {}, document }

    return new DefaultScreenFullscreen(BrowserEnvironment.of(globals), new NullLogger())
  }

  beforeEach(() => {
    page = new FakeDocument()
    sut = fullscreenOf(page)
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      expect(DefaultScreenFullscreen.create().isActive).toBe(false)
    })
  })

  describe('#isSupported', () => {
    test('should be true where the browser can fill the screen with an element', async () => {
      expect(sut.isSupported).toBe(true)
      expect(fullscreenOf(new FakeDocument(true)).isSupported).toBe(true)
    })

    test.each([
      ['there is no page', undefined],
      ['the browser cannot do it', {}],
      ['the page is not allowed to', { fullscreenEnabled: false, exitFullscreen: async () => undefined }],
    ])('should be false where %s', async (_name, document) => {
      expect(fullscreenOf(document).isSupported).toBe(false)
    })
  })

  describe('#enter', () => {
    test('should fill the screen with the element', async () => {
      const element = page.createElement()

      await sut.enter(element, { navigationUI: 'hide' })

      expect(element.requestFullscreen).toHaveBeenCalledExactlyOnceWith({ navigationUI: 'hide' })
      expect(sut.element).toBe(element)
      expect(sut.isActive).toBe(true)
    })

    test('should use the call a browser has under a prefix', async () => {
      page = new FakeDocument(true)
      sut = fullscreenOf(page)
      const element = page.createElement()

      await sut.enter(element)

      expect(sut.element).toBe(element)
    })

    test('should fill the screen with a video where the browser does it with videos only', async () => {
      sut = fullscreenOf({})
      const video = new FakeVideo()

      expect(sut.isSupported).toBe(false)
      expect(sut.canEnter(video as unknown as Element)).toBe(true)

      await sut.enter(video as unknown as Element)

      expect(sut.element).toBe(video)
    })

    test('should refuse an element that cannot fill the screen', async () => {
      const element = {} as Element

      expect(sut.canEnter(element)).toBe(false)
      await expect(sut.enter(element)).rejects.toThrow(UnsupportedError)
    })

    test('should refuse every element but a video where the browser cannot fill the screen', async () => {
      sut = fullscreenOf({})

      expect(sut.canEnter(page.createElement())).toBe(false)
    })

    test('should report a refusal of the browser', async () => {
      const refusal = new TypeError('not allowed')
      const element = { requestFullscreen: () => Promise.reject(refusal) } as unknown as Element

      const failure = await sut.enter(element).catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(ScreenError)
      expect(failure).toHaveProperty('cause', refusal)
    })
  })

  describe('#exit', () => {
    test('should return to the page', async () => {
      await sut.enter(page.createElement())

      await sut.exit()

      expect(sut.element).toBeUndefined()
      expect(sut.isActive).toBe(false)
    })

    test('should use the call a browser has under a prefix', async () => {
      page = new FakeDocument(true)
      sut = fullscreenOf(page)
      await sut.enter(page.createElement())

      await sut.exit()

      expect(sut.isActive).toBe(false)
    })

    test('should end a video that fills the screen', async () => {
      sut = fullscreenOf({})
      const video = new FakeVideo()
      await sut.enter(video as unknown as Element)

      await sut.exit()

      expect(video.webkitDisplayingFullscreen).toBe(false)
      expect(sut.isActive).toBe(false)
    })

    test('should do nothing if no element fills the screen', async () => {
      page.exitFullscreen = vi.fn()

      await sut.exit()

      expect(page.exitFullscreen).not.toHaveBeenCalled()
    })

    test('should report a refusal of the browser', async () => {
      await sut.enter(page.createElement())
      page.exitFullscreen = () => Promise.reject(new TypeError('not now'))

      await expect(sut.exit()).rejects.toThrow(ScreenError)
    })
  })

  describe('change', () => {
    test('should announce the element that fills the screen and when none does', async () => {
      const changes: (Element | undefined)[] = []
      sut.on('change', (element) => changes.push(element))
      const element = page.createElement()

      await sut.enter(element)
      // the user leaves with the key or the gesture of the system
      page.show(null)

      expect(changes).toEqual([element, undefined])
    })

    test('should announce a video that fills the screen and when it stops', async () => {
      sut = fullscreenOf({ addEventListener: () => undefined, removeEventListener: () => undefined })
      const changes: (Element | undefined)[] = []
      sut.on('change', (element) => changes.push(element))
      const video = new FakeVideo()

      await sut.enter(video as unknown as Element)
      video.webkitExitFullscreen()

      expect(changes).toEqual([video, undefined])
    })

    test('should only watch the page while someone listens', async () => {
      expect(page.listenerCount()).toBe(0)

      const subscription = sut.on('change', () => undefined)
      expect(page.listenerCount()).toBe(2)

      subscription.unsubscribe()
      expect(page.listenerCount()).toBe(0)
    })

    test('should accept a listener where there is no page', async () => {
      const fullscreen = fullscreenOf(undefined)

      expect(() => fullscreen.on('change', () => undefined).unsubscribe()).not.toThrow()
    })
  })

  describe('#dispose', () => {
    test('should stop watching and forget every listener', async () => {
      const changes: (Element | undefined)[] = []
      sut.on('change', (element) => changes.push(element))
      const video = new FakeVideo()

      sut.dispose()
      page.show(page.createElement())

      expect(page.listenerCount()).toBe(0)
      expect(video.listenerCount()).toBe(0)
      expect(changes).toEqual([])
    })
  })
})
