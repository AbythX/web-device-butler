import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref, type ShallowRef } from 'vue'

import type { CodeScanner } from '../../../media/scanning/code-scanner.ts'
import type { DetectedCode } from '../../../media/scanning/model/detected-code.ts'
import type { CodeScan, CodeScanOptions, CodeScanSource } from '../../../media/scanning/scan/code-scan.ts'

export interface UseCodeScan {
  /** the scan that runs; `undefined` before `start()` and after it ended */
  readonly scan: ShallowRef<CodeScan | undefined>
  /** the code that came into sight last; kept after the scan ended */
  readonly code: ShallowRef<DetectedCode | undefined>
  readonly isScanning: Ref<boolean>
  /** why the last `start()` failed; cleared by the next one */
  readonly error: ShallowRef<unknown>
  /**
   * Starts to scan the session, after stopping the scan that runs. A failure is not thrown, it ends up in `error`.
   *
   * @returns the scan, or `undefined` if it could not be started
   */
  start(source: CodeScanSource, options?: CodeScanOptions): CodeScan | undefined
  stop(): Promise<void>
}

/**
 * Reading codes as reactive state: `start()` it with an open camera session, show `code.value`. The scan is
 * stopped when the component is unmounted; the session is not.
 */
export const useCodeScan = (scanner: CodeScanner): UseCodeScan => {
  const scan = shallowRef<CodeScan>()
  const code = shallowRef<DetectedCode>()
  const isScanning = ref(false)
  const error = shallowRef<unknown>()

  const stop = async (): Promise<void> => {
    await scan.value?.stop()
  }

  const start = (source: CodeScanSource, options?: CodeScanOptions): CodeScan | undefined => {
    void stop()
    error.value = undefined

    try {
      const started = scanner.scan(source, options)

      started.on('code', (found) => (code.value = found))
      started.on('ended', () => {
        if (scan.value === started) {
          scan.value = undefined
          isScanning.value = false
        }
      })

      scan.value = started
      isScanning.value = true

      return started
    } catch (failure) {
      error.value = failure

      return undefined
    }
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => void stop())
  }

  return { scan, code, isScanning, error, start, stop }
}
