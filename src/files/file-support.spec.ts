import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { FileSupport } from './file-support.ts'

describe('file-support', () => {
  // SAFETY: the support only checks that the call is there
  const window = { showSaveFilePicker: () => Promise.reject(new Error('not shown')) } as unknown as Window
  const document = {} as Document

  test('should show the save dialog on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ window, document })

    expect(FileSupport.canChooseWhereToSaveIn(environment)).toBe(true)
    expect(FileSupport.resolveFor(environment)).toBeTypeOf('function')
  })

  test('should download and pick, but not show the save dialog, outside a secure context', async () => {
    const environment = BrowserEnvironment.of({ window, document, isSecureContext: false })

    expect(FileSupport.canChooseWhereToSaveIn(environment)).toBe(false)
    expect(FileSupport.resolveFor(environment)).toBeUndefined()
    expect(FileSupport.canSaveIn(environment)).toBe(true)
    expect(FileSupport.canPickIn(environment)).toBe(true)
  })

  test('should neither save nor pick without a page', async () => {
    const environment = BrowserEnvironment.of({})

    expect(FileSupport.canChooseWhereToSaveIn(environment)).toBe(false)
    expect(FileSupport.canSaveIn(environment)).toBe(false)
    expect(FileSupport.canPickIn(environment)).toBe(false)
  })
})
