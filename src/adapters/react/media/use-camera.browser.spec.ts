import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultDeviceButler } from '../../../core/default-device-butler.ts'
import type { DeviceButler } from '../../../core/device-butler.ts'
import { hasCamera, isLocked } from '../testing/faked-devices.ts'
import { renderHook } from '../testing/render-hook.ts'
import { waitFor } from '../testing/wait-for.ts'
import { useCamera } from './use-camera.ts'

describe.skipIf(!hasCamera)('useCamera', () => {
  let butler!: DeviceButler

  beforeEach(async () => {
    // Firefox only starts a camera in the tab that is in the foreground
    await commands.showFirstTab()
    butler = DefaultDeviceButler.create()
  })

  afterEach(async () => {
    await butler.dispose()
  })

  test('should open a camera, follow it and close it on unmount', async () => {
    const hook = await renderHook(() => useCamera(butler.camera))
    expect(hook.result.current.session).toBeUndefined()

    await hook.act(() => hook.result.current.open())

    expect(hook.result.current.error).toBeUndefined()
    expect(hook.result.current.session?.stream.getVideoTracks()).toHaveLength(1)
    expect(hook.result.current.state).toBe('live')
    expect(hook.result.current.isOpening).toBe(false)
    expect(hook.result.current.descriptor?.id).toBe(hook.result.current.session?.descriptor.id)
    expect(hook.result.current.settings).toBeDefined()

    await hook.unmount()
    await waitFor(async () => !(await isLocked('camera')))

    expect(await isLocked('camera')).toBe(false)
  })

  test('should say why a session ended', async () => {
    const hook = await renderHook(() => useCamera(butler.camera))
    await hook.act(() => hook.result.current.open())

    await hook.act(() => hook.result.current.close())

    expect(hook.result.current.session).toBeUndefined()
    expect(hook.result.current.state).toBeUndefined()
    expect(hook.result.current.ended).toEqual({ reason: 'closed' })

    await hook.unmount()
  })
})
