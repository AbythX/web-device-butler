import type { CodeScanner } from '../../../media/scanning/code-scanner.ts'
import type { CodeScan, CodeScanOptions, CodeScanSource } from '../../../media/scanning/scan/code-scan.ts'
import { CodeScanController, type CodeScanSnapshot } from '../../state/media/code-scan-controller.ts'
import { useController, useLatest, useSnapshot } from '../use-controller.ts'

export interface UseCodeScan extends CodeScanSnapshot {
  /**
   * Starts to scan the session, after stopping the scan that runs. A failure is not thrown, it ends up in `error`.
   *
   * @returns the scan, or `undefined` if it could not be started
   */
  start(source: CodeScanSource, options?: CodeScanOptions): CodeScan | undefined
  stop(): Promise<void>
}

/**
 * Reading codes as state of a component: `start()` it with an open camera session, show `code`. The scan is stopped
 * when the component is unmounted; the session is not.
 */
export const useCodeScan = (scanner: CodeScanner): UseCodeScan => {
  const latest = useLatest(scanner)
  const controller = useController(() => new CodeScanController(() => latest.current))

  return { ...useSnapshot(controller), start: controller.start, stop: controller.stop }
}
