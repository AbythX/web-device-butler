import { describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { CodeScanSupport } from './code-scan-support.ts'
import { FakeBarcodeDetector } from './testing/fake-barcode-detector.ts'

describe('code-scan-support', () => {
  test('should hand out the decoder of the browser on a page over HTTPS', async () => {
    const environment = BrowserEnvironment.of({ BarcodeDetector: FakeBarcodeDetector })

    expect(CodeScanSupport.hasBuiltInDecoderIn(environment)).toBe(true)
    expect(CodeScanSupport.resolveFor(environment)).toBe(FakeBarcodeDetector)
  })

  test('should have no decoder outside a secure context', async () => {
    const environment = BrowserEnvironment.of({ BarcodeDetector: FakeBarcodeDetector, isSecureContext: false })

    expect(CodeScanSupport.hasBuiltInDecoderIn(environment)).toBe(false)
    expect(CodeScanSupport.resolveFor(environment)).toBeUndefined()
  })

  test('should have no decoder where the browser has none', async () => {
    expect(CodeScanSupport.hasBuiltInDecoderIn(BrowserEnvironment.of({}))).toBe(false)
  })
})
