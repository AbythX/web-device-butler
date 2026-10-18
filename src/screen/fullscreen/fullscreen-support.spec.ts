import { describe, expect, test } from 'vitest'

import { BrowserEnvironment, type BrowserGlobals } from '../../core/environment/browser-environment.ts'
import { FullscreenSupport } from './fullscreen-support.ts'

describe('fullscreen-support', () => {
  const pageWith = (document: object, globals: Partial<BrowserGlobals> = {}) =>
    // SAFETY: the support only reads the fields of the fullscreen
    BrowserEnvironment.of({ window: {} as Window, document: document as Document, ...globals })

  const exitFullscreen = () => Promise.resolve()

  test('should be supported where the document can leave the fullscreen, also outside a secure context', async () => {
    expect(FullscreenSupport.isSupportedIn(pageWith({ fullscreenEnabled: true, exitFullscreen }))).toBe(true)
    expect(FullscreenSupport.isSupportedIn(pageWith({ exitFullscreen }, { isSecureContext: false }))).toBe(true)
  })

  test('should be supported with the calls under the prefix of older browsers', async () => {
    const document = { webkitFullscreenEnabled: true, webkitExitFullscreen: () => undefined }

    expect(FullscreenSupport.isSupportedIn(pageWith(document))).toBe(true)
  })

  test('should not be supported where the browser does not allow it', async () => {
    expect(FullscreenSupport.isSupportedIn(pageWith({ fullscreenEnabled: false, exitFullscreen }))).toBe(false)
  })

  test('should not be supported where the document cannot leave the fullscreen', async () => {
    expect(FullscreenSupport.isSupportedIn(pageWith({ fullscreenEnabled: true }))).toBe(false)
  })

  test('should not be supported without a page', async () => {
    const environment = BrowserEnvironment.of({})

    expect(FullscreenSupport.isSupportedIn(environment)).toBe(false)
    expect(FullscreenSupport.resolveFor(environment)).toBeUndefined()
  })
})
