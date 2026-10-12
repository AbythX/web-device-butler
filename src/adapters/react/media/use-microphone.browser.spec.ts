import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultDeviceButler } from '../../../core/default-device-butler.ts'
import type { DeviceButler } from '../../../core/device-butler.ts'
import { hasCamera, isLocked } from '../testing/faked-devices.ts'
import { renderHook } from '../testing/render-hook.ts'
import { waitFor } from '../testing/wait-for.ts'
import { useMicrophone } from './use-microphone.ts'

describe.skipIf(!hasCamera)('useMicrophone', () => {
  let butler!: DeviceButler

  beforeEach(async () => {
    // Firefox only starts a camera in the tab that is in the foreground
    await commands.showFirstTab()
    butler = DefaultDeviceButler.create()
  })

  afterEach(async () => {
    await butler.dispose()
  })

  test('should open a microphone and mute it', async () => {
    const hook = await renderHook(() => useMicrophone(butler.microphone))
    await hook.act(() => hook.result.current.setMuted(true))

    await hook.act(() => hook.result.current.open())

    // a session that is opened later continues the way the application left it
    expect(hook.result.current.session?.muted).toBe(true)
    expect(hook.result.current.muted).toBe(true)

    await hook.act(() => hook.result.current.setMuted(false))
    expect(hook.result.current.session?.muted).toBe(false)
    expect(hook.result.current.muted).toBe(false)

    await hook.unmount()
    await waitFor(async () => !(await isLocked('microphone')))

    expect(await isLocked('microphone')).toBe(false)
  })
})
