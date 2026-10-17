import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import type { PageLifecycle } from '../../../platform/page/page-lifecycle.ts'
import { FakeRecordingSource } from '../../../media/recording/testing/fake-recording-source.ts'
import { DefaultCodeScanner } from '../../../media/scanning/default-code-scanner.ts'
import { FakeBarcodeDetector } from '../../../media/scanning/testing/fake-barcode-detector.ts'
import { FakeFrameGrabber } from '../../../media/scanning/testing/fake-frame-grabber.ts'
import { renderHook } from '../testing/render-hook.ts'
import { waitFor } from '../testing/wait-for.ts'
import { useCodeScan } from './use-code-scan.ts'

/**
 * The hook runs against fakes: reading real codes is covered by the specs of the zxing decoder.
 */
describe('useCodeScan', () => {
  let scanner!: DefaultCodeScanner
  let source!: FakeRecordingSource

  beforeEach(() => {
    FakeBarcodeDetector.reset()
    source = new FakeRecordingSource()
    scanner = new DefaultCodeScanner(
      { rate: 1000 },
      BrowserEnvironment.of({ BarcodeDetector: FakeBarcodeDetector }),
      { state: 'visible' } as PageLifecycle,
      new NullLogger(),
      () => new FakeFrameGrabber()
    )
  })

  afterEach(() => {
    scanner.dispose()
  })

  test('should show the last code, and stop the scan on unmount', async () => {
    const hook = await renderHook(() => useCodeScan(scanner))

    await hook.act(async () => {
      hook.result.current.start(source)
      FakeBarcodeDetector.codes = [{ format: 'qr_code', rawValue: 'seen', cornerPoints: [] }]
      await waitFor(async () => hook.result.current.code !== undefined)
    })

    const scan = hook.result.current.scan
    expect(hook.result.current.isScanning).toBe(true)
    expect(hook.result.current.code?.value).toBe('seen')

    await hook.unmount()
    await waitFor(async () => scan?.state === 'ended')

    expect(scan?.state).toBe('ended')
  })

  test('should put a failure into the state instead of throwing', async () => {
    const hook = await renderHook(() => useCodeScan(scanner))
    source.end()

    await hook.act(async () => {
      hook.result.current.start(source)
    })

    expect((hook.result.current.error as Error).name).toBe('SessionClosedError')

    await hook.unmount()
  })
})
