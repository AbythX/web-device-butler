import { describe, expect, test } from 'vitest'

import {
  BrowserEnvironment,
  type BrowserGlobals,
  type ClipboardItemFactory,
} from '../../core/environment/browser-environment.ts'
import { ClipboardSupport } from './clipboard-support.ts'

describe('clipboard-support', () => {
  // SAFETY: the support only checks that the calls are there
  const clipboard = {
    readText: () => Promise.resolve(''),
    write: () => Promise.resolve(),
  } as unknown as Clipboard

  const ClipboardItem = class {} as unknown as ClipboardItemFactory

  const environmentOf = (globals: Partial<BrowserGlobals> = {}) =>
    BrowserEnvironment.of({ navigator: { clipboard } as Navigator, ClipboardItem, ...globals })

  test('should read and write on a page over HTTPS', async () => {
    const environment = environmentOf()

    expect(ClipboardSupport.isSupportedIn(environment)).toBe(true)
    expect(ClipboardSupport.canReadIn(environment)).toBe(true)
    expect(ClipboardSupport.canWriteIn(environment, 'image/png')).toBe(true)
    expect(ClipboardSupport.resolveFor(environment)).toBe(clipboard)
    expect(ClipboardSupport.resolveItemFor(environment)).toBe(ClipboardItem)
  })

  test('should do nothing outside a secure context', async () => {
    const environment = environmentOf({ isSecureContext: false })

    expect(ClipboardSupport.isSupportedIn(environment)).toBe(false)
    expect(ClipboardSupport.canReadIn(environment)).toBe(false)
    expect(ClipboardSupport.canWriteIn(environment, 'image/png')).toBe(false)
    expect(ClipboardSupport.resolveFor(environment)).toBeUndefined()
    expect(ClipboardSupport.resolveItemFor(environment)).toBeUndefined()
  })

  test('should write only the common types where the browser cannot be asked', async () => {
    const environment = environmentOf()

    expect(ClipboardSupport.canWriteIn(environment, 'text/html')).toBe(true)
    expect(ClipboardSupport.canWriteIn(environment, 'image/webp')).toBe(false)
  })

  test('should write what the browser says it supports', async () => {
    const asking = Object.assign(class {}, { supports: (type: string) => type === 'image/webp' })
    // SAFETY: the support only calls `supports`
    const environment = environmentOf({ ClipboardItem: asking as unknown as ClipboardItemFactory })

    expect(ClipboardSupport.canWriteIn(environment, 'image/webp')).toBe(true)
    expect(ClipboardSupport.canWriteIn(environment, 'image/png')).toBe(false)
  })

  test('should only copy text without a wrapper for data', async () => {
    const environment = environmentOf({ ClipboardItem: undefined })

    expect(ClipboardSupport.isSupportedIn(environment)).toBe(true)
    expect(ClipboardSupport.canWriteIn(environment, 'text/plain')).toBe(false)
  })

  test('should do nothing where the browser gives pages no clipboard', async () => {
    const environment = BrowserEnvironment.of({ navigator: {} as Navigator })

    expect(ClipboardSupport.isSupportedIn(environment)).toBe(false)
    expect(ClipboardSupport.canReadIn(environment)).toBe(false)
  })
})
