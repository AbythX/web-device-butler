import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultDeviceButler } from '../core/default-device-butler.ts'
import type { DeviceButler } from '../core/device-butler.ts'
import { DeviceButlerError } from '../core/errors/device-butler-error.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import { inAnswerToAClick } from '../core/testing/in-answer-to-a-click.ts'
import { WakeLockHold } from './wake-lock/wake-lock-hold.ts'

/**
 * These specs run in real browsers. Whether a browser keeps a screen on, fills it or keeps it from turning differs
 * between them and between a desktop and a phone, so the specs ask for what holds everywhere: what the library says
 * a browser can do is what it then does, and what a browser refuses arrives as an error of the library.
 */
const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 300 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('the screen in a real browser', () => {
  let butler!: DeviceButler

  beforeEach(async () => {
    await commands.showFirstTab()
    butler = DefaultDeviceButler.create()
  })

  afterEach(async () => {
    await butler.fullscreen.exit().catch(() => undefined)
    await butler.dispose()
  })

  describe('the wake lock', () => {
    test('should keep the screen on where the browser can, and say so where it cannot', async () => {
      const outcome = await butler.wakeLock.request().catch((error: unknown) => error)
      const isHeld = outcome instanceof WakeLockHold

      // a browser may refuse, for example a page it does not show; that is an error of the library
      expect(isHeld || outcome instanceof DeviceButlerError).toBe(true)
      expect(outcome instanceof UnsupportedError).toBe(!butler.wakeLock.isSupported)
      expect(butler.wakeLock.isRequested).toBe(isHeld)
      expect(butler.wakeLock.isActive).toBe(isHeld && butler.page.isVisible)

      butler.wakeLock.dispose()

      expect(butler.wakeLock.isRequested).toBe(false)
      expect(butler.wakeLock.isActive).toBe(false)
    })

    test('should keep the screen on until the last of two holds is released', async () => {
      const holds = await Promise.all([butler.wakeLock.request(), butler.wakeLock.request()]).catch(() => [])
      const [first, second] = holds

      first?.release()
      expect(butler.wakeLock.isRequested).toBe(holds.length === 2)

      second?.release()
      expect(butler.wakeLock.isRequested).toBe(false)
    })

    test('should answer for the permission without failing', async () => {
      const state = await butler.permission.query('screen-wake-lock')

      expect(['granted', 'denied', 'prompt', 'unknown', 'unsupported']).toContain(state)
      expect(state === 'unsupported').toBe(!butler.wakeLock.isSupported)
    })
  })

  describe('fullscreen', () => {
    let element!: HTMLElement

    beforeEach(() => {
      element = document.createElement('div')
      document.body.append(element)
    })

    afterEach(() => {
      element.remove()
    })

    test('should fill the screen with an element in answer to a click and return to the page', async () => {
      const changes: (Element | undefined)[] = []
      butler.fullscreen.on('change', (changed) => changes.push(changed))

      const outcome = await inAnswerToAClick(() => butler.fullscreen.enter(element))
      const hasEntered = outcome === undefined

      // where the browser cannot or will not, it is an error of the library
      expect(hasEntered || outcome instanceof DeviceButlerError).toBe(true)
      expect(butler.fullscreen.canEnter(element)).toBe(butler.fullscreen.isSupported)
      expect(butler.fullscreen.isActive).toBe(hasEntered)
      expect(butler.fullscreen.element).toBe(hasEntered ? element : undefined)

      await butler.fullscreen.exit()
      // a browser announces that the page is back a moment after it is
      await waitFor(() => changes.length === (hasEntered ? 2 : 0))

      expect(butler.fullscreen.isActive).toBe(false)
      expect(changes).toEqual(hasEntered ? [element, undefined] : [])
    })

    test('should refuse to fill the screen without something the user did', async () => {
      const outcome = await butler.fullscreen.enter(element).catch((error: unknown) => error)

      // a browser that allows it anyway has filled the screen
      expect(outcome === undefined ? butler.fullscreen.isActive : outcome instanceof DeviceButlerError).toBe(true)
    })

    test('should do nothing when there is nothing to leave', async () => {
      await expect(butler.fullscreen.exit()).resolves.toBeUndefined()
    })
  })

  describe('the orientation lock', () => {
    test('should keep the page from turning, or say that this device cannot', async () => {
      const outcome = await butler.orientation.lock('landscape').catch((error: unknown) => error)

      // a desktop has the call and rejects it, and most browsers want the page to fill the screen first
      expect(outcome === undefined || outcome instanceof DeviceButlerError).toBe(true)
      expect(butler.orientation.canLock || outcome instanceof UnsupportedError).toBe(true)
      expect(() => butler.orientation.unlock()).not.toThrow()
    })
  })

  describe('the page', () => {
    test('should say that the user can see the page the specs run in', async () => {
      expect(butler.page.state).toBe('visible')
      expect(butler.page.isVisible).toBe(true)
      await expect(butler.page.whenVisible()).resolves.toBeUndefined()
    })
  })
})
