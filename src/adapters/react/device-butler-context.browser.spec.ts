import { createElement } from 'react'
import { describe, expect, test } from 'vitest'

import { DefaultDeviceButler } from '../../core/default-device-butler.ts'
import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { DeviceButlerContext, useDeviceButler } from './device-butler-context.ts'
import { renderHook } from './testing/render-hook.ts'

describe('useDeviceButler', () => {
  test('should return the butler a component further up provided', async () => {
    const butler = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))

    const { result } = await renderHook(useDeviceButler, (component) =>
      createElement(DeviceButlerContext.Provider, { value: butler }, component)
    )

    expect(result.current).toBe(butler)
  })

  test('should say when no butler was provided', async () => {
    const { failure } = await renderHook(useDeviceButler)

    expect(failure.current).toBeInstanceOf(Error)
    expect(String(failure.current)).toContain('No butler was provided')
  })
})
