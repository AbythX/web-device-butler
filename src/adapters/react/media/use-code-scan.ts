import { useCallback, useEffect, useRef, useState } from 'react'

import type { CodeScanner } from '../../../media/scanning/code-scanner.ts'
import type { DetectedCode } from '../../../media/scanning/model/detected-code.ts'
import type { CodeScan, CodeScanOptions, CodeScanSource } from '../../../media/scanning/scan/code-scan.ts'

export interface UseCodeScan {
  /** the scan that runs; `undefined` before `start()` and after it ended */
  readonly scan: CodeScan | undefined
  /** the code that came into sight last; kept after the scan ended */
  readonly code: DetectedCode | undefined
  readonly isScanning: boolean
  /** why the last `start()` failed; cleared by the next one */
  readonly error: unknown
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
  const [scan, setScan] = useState<CodeScan>()
  const [code, setCode] = useState<DetectedCode>()
  const [error, setError] = useState<unknown>()

  /** the scan that runs, also for the callbacks of a render that is over */
  const current = useRef<CodeScan | undefined>(undefined)

  const stop = useCallback(async (): Promise<void> => {
    await current.current?.stop()
  }, [])

  const start = useCallback(
    (source: CodeScanSource, options?: CodeScanOptions): CodeScan | undefined => {
      void current.current?.stop()
      setError(undefined)

      try {
        const started = scanner.scan(source, options)

        started.on('code', (found) => setCode(found))
        started.on('ended', () => {
          if (current.current === started) {
            current.current = undefined
            setScan(undefined)
          }
        })

        current.current = started
        setScan(started)

        return started
      } catch (failure) {
        setError(failure)

        return undefined
      }
    },
    [scanner]
  )

  useEffect(() => () => void current.current?.stop(), [])

  return { scan, code, isScanning: scan !== undefined, error, start, stop }
}
