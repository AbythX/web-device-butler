import { beforeEach, describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../core/testing/fake-event-target.ts'
import { DefaultPageLifecycle } from './default-page-lifecycle.ts'
import type { PageLeave, PageState } from './page-lifecycle.ts'

class FakeDocument extends FakeEventTarget {
  public visibilityState: 'visible' | 'hidden' = 'visible'

  public hide(): void {
    this.visibilityState = 'hidden'
    this.dispatch('visibilitychange', { type: 'visibilitychange' })
  }

  public show(): void {
    this.visibilityState = 'visible'
    this.dispatch('visibilitychange', { type: 'visibilitychange' })
  }
}

describe('default-page-lifecycle', () => {
  let page!: FakeDocument
  let frame!: FakeEventTarget
  let sut!: DefaultPageLifecycle

  const lifecycleOf = (globals: object) => new DefaultPageLifecycle(BrowserEnvironment.of(globals), new NullLogger())

  beforeEach(() => {
    page = new FakeDocument()
    frame = new FakeEventTarget()
    sut = lifecycleOf({ window: frame, document: page })
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      expect(DefaultPageLifecycle.create().isVisible).toBe(false)
    })
  })

  describe('#state', () => {
    test('should tell whether the user can see the page, without a listener', async () => {
      expect(sut.state).toBe('visible')
      expect(sut.isVisible).toBe(true)

      page.hide()

      expect(sut.state).toBe('hidden')
      expect(sut.isVisible).toBe(false)
    })

    test('should not know where there is no page', async () => {
      const nowhere = lifecycleOf({})

      expect(nowhere.state).toBeUndefined()
      expect(nowhere.isVisible).toBe(false)
    })
  })

  describe('#whenVisible', () => {
    test('should resolve once the user can see the page', async () => {
      page.visibilityState = 'hidden'
      let isResolved = false
      void sut.whenVisible().then(() => (isResolved = true))

      await Promise.resolve()
      expect(isResolved).toBe(false)

      page.show()
      await Promise.resolve()
      expect(isResolved).toBe(true)
    })

    test('should resolve at once where there is no page', async () => {
      await expect(lifecycleOf({}).whenVisible()).resolves.toBeUndefined()
    })
  })

  describe('change', () => {
    test('should announce when the page goes to the background, is frozen and comes back', async () => {
      const changes: PageState[] = []
      sut.on('change', (state) => changes.push(state))

      page.hide()
      page.dispatch('freeze', { type: 'freeze' })
      expect(sut.state).toBe('frozen')
      page.dispatch('resume', { type: 'resume' })
      page.show()

      expect(changes).toEqual(['hidden', 'frozen', 'hidden', 'visible'])
    })

    test('should not announce a state the page is in already', async () => {
      const changes: PageState[] = []
      sut.on('change', (state) => changes.push(state))

      page.show()
      page.dispatch('resume', { type: 'resume' })

      expect(changes).toEqual([])
    })

    test('should only watch the page while someone listens', async () => {
      expect(page.listenerCount()).toBe(0)

      const subscription = sut.on('change', () => undefined)
      expect(page.listenerCount()).toBe(3)
      expect(frame.listenerCount()).toBe(0)

      subscription.unsubscribe()
      expect(page.listenerCount()).toBe(0)
    })

    test('should forget that the page was frozen once nobody listens', async () => {
      const subscription = sut.on('change', () => undefined)
      page.dispatch('freeze', { type: 'freeze' })

      subscription.unsubscribe()

      expect(sut.state).toBe('visible')
    })

    test('should accept a listener where there is no page', async () => {
      const nowhere = lifecycleOf({})

      expect(() => nowhere.on('change', () => undefined).unsubscribe()).not.toThrow()
      expect(() => nowhere.on('leave', () => undefined).unsubscribe()).not.toThrow()
    })
  })

  describe('leave', () => {
    test('should announce that the page is being left, and whether the browser keeps it', async () => {
      const leaves: PageLeave[] = []
      sut.on('leave', (leave) => leaves.push(leave))

      frame.dispatch('pagehide', { persisted: true })
      frame.dispatch('pagehide', { persisted: false })

      expect(leaves).toEqual([{ isKept: true }, { isKept: false }])
    })

    test('should only watch the window while someone listens', async () => {
      const subscription = sut.on('leave', () => undefined)
      expect(frame.listenerCount()).toBe(1)
      expect(page.listenerCount()).toBe(0)

      subscription.unsubscribe()
      expect(frame.listenerCount()).toBe(0)
    })
  })

  describe('#dispose', () => {
    test('should stop watching and forget every listener', async () => {
      const changes: PageState[] = []
      sut.on('change', (state) => changes.push(state))
      sut.on('leave', () => changes.push('hidden'))

      sut.dispose()
      page.hide()
      frame.dispatch('pagehide', {})

      expect(page.listenerCount()).toBe(0)
      expect(frame.listenerCount()).toBe(0)
      expect(changes).toEqual([])
    })
  })
})
