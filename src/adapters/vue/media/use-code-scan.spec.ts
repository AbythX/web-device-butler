import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import { BrowserEnvironment } from '../../../core/environment/browser-environment.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import type { PageLifecycle } from '../../../platform/page/page-lifecycle.ts'
import { FakeRecordingSource } from '../../../media/recording/testing/fake-recording-source.ts'
import { DefaultCodeScanner } from '../../../media/scanning/default-code-scanner.ts'
import { FakeBarcodeDetector } from '../../../media/scanning/testing/fake-barcode-detector.ts'
import { FakeFrameGrabber } from '../../../media/scanning/testing/fake-frame-grabber.ts'
import { useCodeScan } from './use-code-scan.ts'

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

describe('use-code-scan', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope
  let scanner!: DefaultCodeScanner
  let source!: FakeRecordingSource

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    FakeBarcodeDetector.reset()
    scope = effectScope()
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
    scope.stop()
    scanner.dispose()
  })

  test('should show the code that came into sight last', async () => {
    const scan = within(() => useCodeScan(scanner))

    scan.start(source)
    FakeBarcodeDetector.codes = [{ format: 'qr_code', rawValue: 'first', cornerPoints: [] }]
    await waitFor(() => scan.code.value !== undefined)

    expect(scan.isScanning.value).toBe(true)
    expect(scan.code.value?.value).toBe('first')
  })

  test('should follow a scan that ends with its session, and keep the last code', async () => {
    const scan = within(() => useCodeScan(scanner))
    FakeBarcodeDetector.codes = [{ format: 'qr_code', rawValue: 'kept', cornerPoints: [] }]
    scan.start(source)
    await waitFor(() => scan.code.value !== undefined)

    source.end()
    await waitFor(() => !scan.isScanning.value)

    expect(scan.scan.value).toBeUndefined()
    expect(scan.code.value?.value).toBe('kept')
  })

  test('should put a failure into the state instead of throwing', () => {
    const scan = within(() => useCodeScan(scanner))
    source.end()

    expect(scan.start(source)).toBeUndefined()
    expect((scan.error.value as Error).name).toBe('SessionClosedError')
  })

  test('should stop the scan when the component is unmounted', async () => {
    const scan = within(() => useCodeScan(scanner))
    const started = scan.start(source)

    scope.stop()
    await waitFor(() => started?.state === 'ended')

    expect(started?.state).toBe('ended')
    expect(source.state).toBe('live')
  })
})
