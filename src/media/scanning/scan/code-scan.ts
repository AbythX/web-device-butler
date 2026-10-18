import type { Listenable } from '../../../core/events/listenable.ts'
import type { MediaSessionEnd, MediaSessionState } from '../../session/media-session.ts'
import type { CodeDecoder } from '../decoders/code-decoder.ts'
import type { CodeRegion } from '../frames/code-picture.ts'
import type { CodeFormat } from '../model/code-format.ts'
import type { DetectedCode } from '../model/detected-code.ts'

export interface CodeScanSourceEvents {
  statechange: MediaSessionState
  ended: MediaSessionEnd
}

/**
 * What can be scanned: a camera session, the session of a camera and a microphone, a capture of the screen.
 */
export interface CodeScanSource extends Listenable<CodeScanSourceEvents> {
  readonly stream: MediaStream
  readonly state: MediaSessionState
}

/**
 * How a scan looks for codes. The same shape is the `scanner` section of the configuration (the defaults) and the
 * options of `scan()` and `detect()`.
 */
export interface CodeScanOptions {
  /** the kinds of codes to look for; default: every kind the decoder can read. Fewer are found faster. */
  formats?: readonly CodeFormat[]
  /** how many pictures are looked at per second, at most; default: `10` */
  rate?: number
  /** the part of the picture to look at; default: all of it */
  region?: CodeRegion
  /**
   * How long a code has to be out of sight before it is reported again, in milliseconds. Default: `2000`, so a
   * code that is held in front of the camera is reported once.
   */
  repeatAfter?: number
  /** default: the decoder of the configuration, or the code detector of the browser */
  decoder?: CodeDecoder
}

/**
 * - `scanning`: pictures are looked at, as long as the page can be seen and the session delivers
 * - `paused`: the application paused it
 * - `ended`: it was stopped, or its session ended
 */
export type CodeScanState = 'scanning' | 'paused' | 'ended'

export interface CodeScanEnd {
  /** `closed`: the application stopped it; `source`: its session ended */
  readonly reason: 'closed' | 'source'
}

export interface CodeScanEvents {
  /** a code came into sight */
  code: DetectedCode
  statechange: CodeScanState
  /** emitted once */
  ended: CodeScanEnd
}

/**
 * One scan that runs: it looks at the pictures of a session and reports the codes in them. It is started with
 * `butler.scanner.scan()` and ends with {@link stop}, or by itself when its session ends.
 *
 * It looks at nothing while the page is in the background or the session is muted, and at no more than one picture
 * at a time: a slow decoder lowers the rate instead of piling up work.
 */
export interface CodeScan extends Listenable<CodeScanEvents>, AsyncDisposable {
  readonly state: CodeScanState

  /**
   * Waits for the next code that comes into sight.
   *
   * @throws SessionClosedError if the scan ends first
   * @throws the reason of the signal, if it aborts first
   */
  next(options?: { signal?: AbortSignal }): Promise<DetectedCode>

  /**
   * Stops looking until {@link resume}. The session keeps running.
   */
  pause(): void

  resume(): void

  /**
   * Ends the scan. The session keeps running.
   *
   * @returns a promise that resolves once the picture that is being looked at is done
   */
  stop(): Promise<void>
}
