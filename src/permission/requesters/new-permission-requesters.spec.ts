import { describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { ScreenError } from '../../screen/errors/screen-error.ts'
import type { ScreenWakeLock } from '../../screen/wake-lock/screen-wake-lock.ts'
import { WakeLockHold } from '../../screen/wake-lock/wake-lock-hold.ts'
import { PermissionDeniedError } from '../errors/permission-denied-error.ts'
import { ClipboardReadPermissionRequester } from './clipboard-read-permission-requester.ts'
import { WakeLockPermissionRequester } from './wake-lock-permission-requester.ts'

const errorNamed = (name: string) => Object.assign(new Error(name), { name })

describe('clipboard-read-permission-requester', () => {
  const requesterOf = (globals: object) => new ClipboardReadPermissionRequester(BrowserEnvironment.of(globals))
  const reading = (readText: () => Promise<string>) => requesterOf({ navigator: { clipboard: { readText } } })

  test.each([
    ['there is no browser', {}],
    ['pages cannot read the clipboard', { navigator: { clipboard: {} } }],
    ['the page is not secure', { navigator: { clipboard: { readText: async () => '' } }, isSecureContext: false }],
  ])('should not be supported where %s', async (_name, globals) => {
    const sut = requesterOf(globals)

    expect(sut.isSupported).toBe(false)
    expect(await sut.request()).toBe('unsupported')
  })

  test('should read the clipboard once and report that it may', async () => {
    const readText = vi.fn(async () => 'copied')
    const sut = reading(readText)

    expect(sut.isSupported).toBe(true)
    expect(await sut.request()).toBe('granted')
    expect(readText).toHaveBeenCalledOnce()
  })

  test('should report a refusal as a state', async () => {
    expect(await reading(() => Promise.reject(errorNamed('NotAllowedError'))).request()).toBe('denied')
  })

  test('should leave any other failure to the Permissions API', async () => {
    expect(await reading(() => Promise.reject(errorNamed('DataError'))).request()).toBeUndefined()
  })
})

describe('wake-lock-permission-requester', () => {
  test('should follow whether the browser can keep the screen on', async () => {
    expect(new WakeLockPermissionRequester(mock<ScreenWakeLock>({ isSupported: false })).isSupported).toBe(false)
    expect(new WakeLockPermissionRequester(mock<ScreenWakeLock>({ isSupported: true })).isSupported).toBe(true)
  })

  test('should keep the screen on for a moment and report that it may', async () => {
    const hold = new WakeLockHold(() => undefined)
    const sut = new WakeLockPermissionRequester(mock<ScreenWakeLock>({ request: async () => hold }))

    expect(await sut.request()).toBe('granted')
    expect(hold.isReleased).toBe(true)
  })

  test('should report a refusal as a state', async () => {
    const refusal = new PermissionDeniedError('screen-wake-lock')
    const sut = new WakeLockPermissionRequester(mock<ScreenWakeLock>({ request: () => Promise.reject(refusal) }))

    expect(await sut.request()).toBe('denied')
  })

  test('should leave any other failure to the Permissions API', async () => {
    const failure = new ScreenError('broken')
    const sut = new WakeLockPermissionRequester(mock<ScreenWakeLock>({ request: () => Promise.reject(failure) }))

    expect(await sut.request()).toBeUndefined()
  })
})
