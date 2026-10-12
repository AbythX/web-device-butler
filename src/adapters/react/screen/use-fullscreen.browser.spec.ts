import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { FakeEventTarget } from '../../../core/testing/fake-event-target.ts'
import { DefaultScreenFullscreen } from '../../../screen/fullscreen/default-screen-fullscreen.ts'
import { renderHook } from '../testing/render-hook.ts'
import { useFullscreen } from './use-fullscreen.ts'

describe('useFullscreen', () => {
  test('should follow what fills the screen', async () => {
    const page = Object.assign(new FakeEventTarget(), {
      fullscreenElement: null as object | null,
      exitFullscreen: async () => show(null),
    })

    const show = (element: object | null) => {
      page.fullscreenElement = element
      page.dispatch('fullscreenchange')
    }

    const element = { requestFullscreen: async () => show(element) } as unknown as Element

    const fullscreen = new DefaultScreenFullscreen(
      BrowserEnvironment.of({ window: {}, document: page } as object),
      new NullLogger()
    )

    const hook = await renderHook(() => useFullscreen(fullscreen))
    expect(hook.result.current.isActive).toBe(false)

    await hook.act(() => hook.result.current.enter(element))
    expect(hook.result.current.element).toBe(element)
    expect(hook.result.current.isActive).toBe(true)

    // the user leaves with the key of the system
    await hook.act(() => show(null))
    expect(hook.result.current.isActive).toBe(false)

    await hook.unmount()
    expect(page.listenerCount()).toBe(0)
  })
})
