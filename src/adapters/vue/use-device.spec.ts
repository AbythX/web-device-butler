import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createApp, defineComponent, effectScope, h, type EffectScope } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { DefaultDevice } from '../../core/default-device.ts'
import type { Device } from '../../core/device.ts'
import { DeviceEnvironment } from '../../core/environment/device-environment.ts'
import { deviceInjectionKey, provideDevice, useDevice } from './use-device.ts'

describe('use-device', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope

  beforeEach(() => {
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  /** runs the set-up of a component, the way rendering on a server does: without a page */
  const render = async (setup: () => void, device?: Device) => {
    const app = createApp(
      defineComponent({
        setup() {
          setup()

          return () => h('div')
        },
      })
    )

    app.config.warnHandler = () => undefined

    if (device !== undefined) {
      app.provide(deviceInjectionKey, device)
    }

    await renderToString(app)
  }

  test('should give the device the application provided', async () => {
    const device = DefaultDevice.create({}, DeviceEnvironment.of({}))
    let found: Device | undefined

    await render(() => (found = useDevice()), device)

    expect(found).toBe(device)
  })

  test('should give the device a component provided to the ones below it', async () => {
    const device = DefaultDevice.create({}, DeviceEnvironment.of({}))
    let found: Device | undefined

    const child = defineComponent({
      setup() {
        found = useDevice()

        return () => h('div')
      },
    })

    const app = createApp(
      defineComponent({
        setup() {
          provideDevice(device)

          return () => h(child)
        },
      })
    )

    await renderToString(app)

    expect(found).toBe(device)
  })

  test('should say what to do if no device was provided', async () => {
    await expect(render(() => useDevice())).rejects.toThrow('No device was provided')
  })
})
