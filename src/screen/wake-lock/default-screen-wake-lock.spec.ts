import { beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { FakeEventTarget } from '../../core/testing/fake-event-target.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { ScreenError } from '../errors/screen-error.ts'
import { DefaultScreenWakeLock } from './default-screen-wake-lock.ts'

/** what a browser hands out for a wake lock */
class FakeSentinel extends FakeEventTarget {
  public released = false

  public async release(): Promise<void> {
    this.drop()
  }

  /** the browser takes the lock back, as it does when the page goes to the background */
  public drop(): void {
    if (!this.released) {
      this.released = true
      this.dispatch('release')
    }
  }
}

class FakeWakeLock {
  public readonly sentinels: FakeSentinel[] = []
  /** makes the next requests fail */
  public failure: unknown
  /** called before a request is answered */
  public beforeAnswer: () => void = () => undefined

  public async request(): Promise<FakeSentinel> {
    await Promise.resolve()
    this.beforeAnswer()

    if (this.failure !== undefined) {
      throw this.failure
    }

    const sentinel = new FakeSentinel()
    this.sentinels.push(sentinel)

    return sentinel
  }

  public get active(): FakeSentinel[] {
    return this.sentinels.filter((sentinel) => !sentinel.released)
  }
}

class FakeDocument extends FakeEventTarget {
  public visibilityState: 'visible' | 'hidden' = 'visible'

  public show(): void {
    this.visibilityState = 'visible'
    this.dispatch('visibilitychange')
  }

  public hide(wakeLock: FakeWakeLock): void {
    this.visibilityState = 'hidden'
    wakeLock.active.forEach((sentinel) => sentinel.drop())
    this.dispatch('visibilitychange')
  }
}

const settled = () => new Promise((resolve) => setTimeout(resolve))

describe('default-screen-wake-lock', () => {
  let wakeLock!: FakeWakeLock
  let page!: FakeDocument
  let logger!: Logger
  let sut!: DefaultScreenWakeLock

  const wakeLockOf = (globals: object) => new DefaultScreenWakeLock(BrowserEnvironment.of(globals), logger)

  beforeEach(() => {
    wakeLock = new FakeWakeLock()
    page = new FakeDocument()
    logger = mock<Logger>()
    sut = wakeLockOf({ window: {}, document: page, navigator: { wakeLock } })
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      expect(DefaultScreenWakeLock.create().isActive).toBe(false)
    })
  })

  describe('#isSupported', () => {
    test('should be true where the browser can keep the screen on', async () => {
      expect(sut.isSupported).toBe(true)
    })

    test.each([
      ['there is no browser', {}],
      ['the browser cannot keep the screen on', { window: {}, document: {}, navigator: {} }],
      ['the page is not secure', { navigator: { wakeLock: new FakeWakeLock() }, isSecureContext: false }],
    ])('should be false where %s', async (_name, globals) => {
      const unsupported = wakeLockOf(globals)

      expect(unsupported.isSupported).toBe(false)
      await expect(unsupported.request()).rejects.toThrow(UnsupportedError)
    })
  })

  describe('#request', () => {
    test('should keep the screen on until the hold is released', async () => {
      const hold = await sut.request()

      expect(sut.isActive).toBe(true)
      expect(sut.isRequested).toBe(true)
      expect(wakeLock.active).toHaveLength(1)

      hold.release()

      expect(sut.isActive).toBe(false)
      expect(sut.isRequested).toBe(false)
      expect(wakeLock.active).toHaveLength(0)
      expect(hold.isReleased).toBe(true)
    })

    test('should keep the screen on until the last of several holds is released', async () => {
      const first = await sut.request()
      const second = await sut.request()

      expect(wakeLock.sentinels).toHaveLength(1)

      first.release()
      expect(sut.isActive).toBe(true)

      second.release()
      expect(sut.isActive).toBe(false)
    })

    test('should ask the browser once for requests that are made at the same time', async () => {
      await Promise.all([sut.request(), sut.request()])

      expect(wakeLock.sentinels).toHaveLength(1)
    })

    test('should release a hold that is declared with using', async () => {
      {
        using hold = await sut.request()
        expect(hold.isReleased).toBe(false)
      }

      expect(sut.isActive).toBe(false)
    })

    test('should give back what the browser hands out after the hold was released', async () => {
      const requested = sut.request()
      wakeLock.beforeAnswer = () => sut.dispose()

      await requested

      expect(sut.isActive).toBe(false)
      expect(wakeLock.active).toHaveLength(0)
    })

    test('should report a refusal of the browser', async () => {
      wakeLock.failure = Object.assign(new Error('refused'), { name: 'NotAllowedError' })

      const failure = await sut.request().catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(PermissionDeniedError)
      expect(failure).toHaveProperty('cause', wakeLock.failure)
      expect(sut.isRequested).toBe(false)
      expect(page.listenerCount()).toBe(0)
    })

    test('should report any other failure as an error of the screen', async () => {
      wakeLock.failure = new Error('broken')

      await expect(sut.request()).rejects.toThrow(ScreenError)
    })
  })

  describe('the page in the background', () => {
    test('should take the lock again when the page returns', async () => {
      const hold = await sut.request()

      page.hide(wakeLock)
      expect(sut.isActive).toBe(false)
      expect(sut.isRequested).toBe(true)

      page.show()
      await settled()

      expect(sut.isActive).toBe(true)
      expect(wakeLock.sentinels).toHaveLength(2)

      hold.release()
      expect(wakeLock.active).toHaveLength(0)
    })

    test('should hand out a hold to a page in the background and keep the screen on once it returns', async () => {
      page.visibilityState = 'hidden'

      const hold = await sut.request()

      expect(hold.isReleased).toBe(false)
      expect(sut.isActive).toBe(false)
      expect(wakeLock.sentinels).toHaveLength(0)

      page.show()
      await settled()

      expect(sut.isActive).toBe(true)
    })

    test('should not fail a request the page went to the background during', async () => {
      wakeLock.beforeAnswer = () => {
        page.visibilityState = 'hidden'
        wakeLock.failure = Object.assign(new Error('hidden'), { name: 'NotAllowedError' })
      }

      const hold = await sut.request()

      expect(hold.isReleased).toBe(false)
      expect(sut.isActive).toBe(false)
    })

    test('should not take the lock again once every hold is released', async () => {
      const hold = await sut.request()
      page.hide(wakeLock)
      hold.release()

      page.show()
      await settled()

      expect(wakeLock.sentinels).toHaveLength(1)
      expect(page.listenerCount()).toBe(0)
    })

    test('should log a lock that cannot be taken again', async () => {
      await sut.request()
      page.hide(wakeLock)
      wakeLock.failure = new Error('broken')

      page.show()
      await settled()

      expect(logger.warn).toHaveBeenCalledOnce()
      expect(sut.isActive).toBe(false)
    })
  })

  describe('change', () => {
    test('should announce when the browser starts and stops keeping the screen on', async () => {
      const changes: boolean[] = []
      sut.on('change', (isActive) => changes.push(isActive))

      const hold = await sut.request()
      page.hide(wakeLock)
      page.show()
      await settled()
      hold.release()

      expect(changes).toEqual([true, false, true, false])
    })
  })

  describe('#dispose', () => {
    test('should release every hold and forget every listener', async () => {
      const changes: boolean[] = []
      const hold = await sut.request()
      sut.on('change', (isActive) => changes.push(isActive))

      sut.dispose()

      expect(hold.isReleased).toBe(true)
      expect(wakeLock.active).toHaveLength(0)
      expect(page.listenerCount()).toBe(0)
      expect(changes).toEqual([false])
    })
  })
})
