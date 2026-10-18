import type { CodeScanner } from '../../../media/scanning/code-scanner.ts'
import type { DetectedCode } from '../../../media/scanning/model/detected-code.ts'
import type { CodeScan, CodeScanOptions, CodeScanSource } from '../../../media/scanning/scan/code-scan.ts'
import { StateController } from '../state-controller.ts'

export interface CodeScanSnapshot {
  /** the scan that runs; `undefined` before `start()` and after it ended */
  readonly scan: CodeScan | undefined
  /** the code that came into sight last; kept after the scan ended */
  readonly code: DetectedCode | undefined
  readonly isScanning: boolean
  /** why the last `start()` failed; cleared by the next one */
  readonly error: unknown
}

/**
 * One scan at a time. The scan is stopped when the component goes away; the session it scans is not. Shared by
 * `useCodeScan` of both adapters.
 */
export class CodeScanController extends StateController<CodeScanSnapshot> {
  /**
   * @param scanner a getter, so a component can hand over another one
   */
  public constructor(private readonly scanner: () => CodeScanner) {
    super({ scan: undefined, code: undefined, isScanning: false, error: undefined })
  }

  /**
   * Starts to scan the session, after stopping the scan that runs. A failure is not thrown, it ends up in `error`.
   *
   * @returns the scan, or `undefined` if it could not be started
   */
  public readonly start = (source: CodeScanSource, options?: CodeScanOptions): CodeScan | undefined => {
    void this.stop()
    this.change({ error: undefined })

    try {
      const started = this.scanner().scan(source, options)

      started.on('code', (code) => this.change({ code }))
      started.on('ended', () => {
        if (this.read().scan === started) {
          this.change({ scan: undefined, isScanning: false })
        }
      })

      this.change({ scan: started, isScanning: true })

      return started
    } catch (failure) {
      this.change({ error: failure })

      return undefined
    }
  }

  public readonly stop = async (): Promise<void> => {
    await this.read().scan?.stop()
  }

  protected override onDeactivate(): void {
    void this.stop()
  }
}
