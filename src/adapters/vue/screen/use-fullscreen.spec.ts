import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'
import { ScreenError } from '../../../screen/errors/screen-error.ts'
import { DefaultScreenFullscreen } from '../../../screen/fullscreen/default-screen-fullscreen.ts'
import { useFullscreen } from './use-fullscreen.ts'

class FakeDocument extends FakeEventTarget {
  public fullscreenElement: object | null = null

  public readonly exitFullscreen = async (): Promise<void> => this.show(null)

  public show(element: object | null): void {
    this.fullscreenElement = element
    this.dispatch('fullscreenchange')
  }

  public createElement(): Element {
    const element = { requestFullscreen: async () => this.show(element) }

    return element as unknown as Element
  }
}

describe('use-fullscreen', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope
  let page!: FakeDocument
  let fullscreen!: DefaultScreenFullscreen

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    scope = effectScope()
    page = new FakeDocument()
    fullscreen = new DefaultScreenFullscreen(
      BrowserEnvironment.of({ window: {}, document: page } as object),
      new NullLogger()
    )
  })

  afterEach(() => {
    scope.stop()
  })

  test('should follow what fills the screen', async () => {
    const state = within(() => useFullscreen(fullscreen))
    const element = page.createElement()
    expect(state.isActive.value).toBe(false)

    await state.enter(element)
    expect(state.element.value).toBe(element)
    expect(state.isActive.value).toBe(true)

    await state.exit()
    expect(state.element.value).toBeUndefined()
    expect(state.isActive.value).toBe(false)
  })

  test('should follow the user leaving with the key of the system', async () => {
    const state = within(() => useFullscreen(fullscreen))
    await state.enter(page.createElement())

    page.show(null)

    expect(state.isActive.value).toBe(false)
  })

  test('should say why the screen was not filled', async () => {
    const state = within(() => useFullscreen(fullscreen))
    const refusing = { requestFullscreen: () => Promise.reject(new TypeError('not allowed')) } as unknown as Element

    await state.enter(refusing)

    expect(state.error.value).toBeInstanceOf(ScreenError)
    expect(state.isActive.value).toBe(false)
  })

  test('should stop watching when the component is unmounted', async () => {
    within(() => useFullscreen(fullscreen))
    expect(page.listenerCount()).toBe(2)

    scope.stop()

    expect(page.listenerCount()).toBe(0)
  })
})
