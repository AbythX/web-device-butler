import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createApp, defineComponent, effectScope, h, type EffectScope } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { DefaultDeviceButler } from '../../core/default-device-butler.ts'
import type { DeviceButler } from '../../core/device-butler.ts'
import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { deviceButlerInjectionKey, provideDeviceButler, useDeviceButler } from './use-device-butler.ts'

describe('use-device-butler', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope

  beforeEach(() => {
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  /** runs the set-up of a component, the way rendering on a server does: without a page */
  const render = async (setup: () => void, butler?: DeviceButler) => {
    const app = createApp(
      defineComponent({
        setup() {
          setup()

          return () => h('div')
        },
      })
    )

    app.config.warnHandler = () => undefined

    if (butler !== undefined) {
      app.provide(deviceButlerInjectionKey, butler)
    }

    await renderToString(app)
  }

  test('should give the butler the application provided', async () => {
    const butler = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))
    let found: DeviceButler | undefined

    await render(() => (found = useDeviceButler()), butler)

    expect(found).toBe(butler)
  })

  test('should give the butler a component provided to the ones below it', async () => {
    const butler = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))
    let found: DeviceButler | undefined

    const child = defineComponent({
      setup() {
        found = useDeviceButler()

        return () => h('div')
      },
    })

    const app = createApp(
      defineComponent({
        setup() {
          provideDeviceButler(butler)

          return () => h(child)
        },
      })
    )

    await renderToString(app)

    expect(found).toBe(butler)
  })

  test('should say what to do if no butler was provided', async () => {
    await expect(render(() => useDeviceButler())).rejects.toThrow('No butler was provided')
  })
})
