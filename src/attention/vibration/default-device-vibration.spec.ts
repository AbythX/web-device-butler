import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { DefaultDeviceVibration } from './default-device-vibration.ts'

describe('default-device-vibration', () => {
  let vibrate!: ReturnType<typeof vi.fn>
  let sut!: DefaultDeviceVibration

  beforeEach(() => {
    vibrate = vi.fn(() => true)
    sut = new DefaultDeviceVibration(
      BrowserEnvironment.of({ navigator: { vibrate } as unknown as Navigator }),
      mock<Logger>()
    )
  })

  test('should be supported where the browser can vibrate', () => {
    expect(sut.isSupported).toBe(true)
    expect(DefaultDeviceVibration.create(BrowserEnvironment.of({})).isSupported).toBe(false)
  })

  test.each([
    ['tap', [15]],
    ['success', [40, 60, 40]],
    ['error', [90, 50, 90, 50, 90]],
    ['long', [500]],
  ] as const)('should play the pattern %s', (name, pattern) => {
    expect(sut.vibrate(name)).toBe(true)
    expect(vibrate).toHaveBeenCalledWith(pattern)
  })

  test('should take a length and lengths of its own', () => {
    sut.vibrate(200)
    sut.vibrate([100, 50, 100])

    expect(vibrate.mock.calls).toEqual([[200], [[100, 50, 100]]])
  })

  test('should say when the browser did not vibrate, as Chromium before the user used the page', () => {
    vibrate.mockReturnValue(false)

    expect(sut.vibrate('tap')).toBe(false)
  })

  test('should do nothing where the browser cannot vibrate, as Safari', () => {
    expect(DefaultDeviceVibration.create(BrowserEnvironment.of({})).vibrate('tap')).toBe(false)
  })

  test('should stop a pattern that runs', () => {
    sut.stop()

    expect(vibrate).toHaveBeenCalledWith(0)
  })
})
