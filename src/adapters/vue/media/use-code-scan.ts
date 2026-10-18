import type { Ref, ShallowRef } from 'vue'

import type { CodeScanner } from '../../../media/scanning/code-scanner.ts'
import type { DetectedCode } from '../../../media/scanning/model/detected-code.ts'
import type { CodeScan, CodeScanOptions, CodeScanSource } from '../../../media/scanning/scan/code-scan.ts'
import { CodeScanController } from '../../state/media/code-scan-controller.ts'
import { useController } from '../use-controller.ts'

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
  const controller = new CodeScanController(() => scanner)

  return { ...useController(controller), start: controller.start, stop: controller.stop }
}
