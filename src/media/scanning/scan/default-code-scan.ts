import '../../../core/disposable-polyfill.ts'

import { EventEmitter } from '../../../core/events/event-emitter.ts'
import type { EventSubscription } from '../../../core/events/event-subscription.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import type { PageLifecycle } from '../../../platform/page/page-lifecycle.ts'
import { SessionClosedError } from '../../errors/session-closed-error.ts'
import type { CodeDecoder } from '../decoders/code-decoder.ts'
import { type CodePoint, type DetectedCode, shiftCode } from '../model/detected-code.ts'
import type { FrameGrabber } from '../frames/frame-grabber.ts'
import type {
  CodeScan,
  CodeScanEnd,
  CodeScanEvents,
  CodeScanOptions,
  CodeScanSource,
  CodeScanState,
} from './code-scan.ts'

interface Waiter {
  resolve(code: DetectedCode): void
  reject(reason: unknown): void
}

/**
 * The implementation of {@link CodeScan}.
 */
export class DefaultCodeScan extends EventEmitter<CodeScanEvents> implements CodeScan {
  private static readonly defaultRate = 10
  private static readonly defaultRepeatAfter = 2000

  private currentState: CodeScanState = 'scanning'
  private timer: ReturnType<typeof setTimeout> | undefined
  /** the picture that is being looked at; never rejects */
  private looking: Promise<void> = Promise.resolve()
  private ending: Promise<void> | undefined
  private hasReportedFailure = false
  /** when each code was in sight the last time, by its format and value */
  private readonly lastSeen = new Map<string, number>()
  private readonly waiters = new Set<Waiter>()
  private readonly subscriptions: EventSubscription[]

  public constructor(
    private readonly source: CodeScanSource,
    private readonly decoder: CodeDecoder,
    private readonly options: CodeScanOptions,
    private readonly grabber: FrameGrabber,
    private readonly page: PageLifecycle,
    private readonly logger: Logger
  ) {
    super()

    this.subscriptions = [source.on('ended', () => void this.end({ reason: 'source' }))]
    this.schedule(0)
  }

  public get state(): CodeScanState {
    return this.currentState
  }

  public next(options: { signal?: AbortSignal } = {}): Promise<DetectedCode> {
    const { signal } = options

    if (this.currentState === 'ended') {
      return Promise.reject(new SessionClosedError('The scan has ended'))
    }

    if (signal?.aborted) {
      return Promise.reject(signal.reason)
    }

    return new Promise((resolve, reject) => {
      const abort = () => {
        this.waiters.delete(waiter)
        reject(signal?.reason)
      }

      const waiter: Waiter = {
        resolve: (code) => {
          signal?.removeEventListener('abort', abort)
          resolve(code)
        },
        reject: (reason) => {
          signal?.removeEventListener('abort', abort)
          reject(reason)
        },
      }

      this.waiters.add(waiter)
      signal?.addEventListener('abort', abort, { once: true })
    })
  }

  public pause(): void {
    this.changeState('paused')
  }

  public resume(): void {
    if (this.currentState === 'paused') {
      this.changeState('scanning')
    }
  }

  public stop(): Promise<void> {
    return this.end({ reason: 'closed' })
  }

  /**
   * Calls {@link stop}, so the object can be declared with `await using`.
   */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.stop()
  }

  private get interval(): number {
    return 1000 / Math.max(this.options.rate ?? DefaultCodeScan.defaultRate, 0.001)
  }

  /**
   * Whether a picture is worth looking at: a browser delivers none, or a still one, while the page is in the
   * background, and a session that is muted delivers nothing.
   */
  private get isWatching(): boolean {
    const isHidden = this.page.state === 'hidden' || this.page.state === 'frozen'

    return this.currentState === 'scanning' && this.source.state === 'live' && !isHidden
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.looking = this.look()
    }, delay)
  }

  /**
   * Looks at one picture and waits for the rest of the interval, measured from when it began, so a slow decoder
   * lowers the rate.
   */
  private async look(): Promise<void> {
    const startedAt = Date.now()

    if (this.isWatching) {
      try {
        const picture = await this.grabber.grab(this.source.stream, this.options.region)

        if (picture !== undefined && this.currentState !== 'ended') {
          const codes = await this.decoder.decode(picture.image, this.options.formats)
          this.report(codes, picture.offset)
        }
      } catch (error) {
        // a picture that cannot be read is no reason to stop: the next one may be fine
        if (!this.hasReportedFailure) {
          this.hasReportedFailure = true
          this.logger.warn(`The decoder ${this.decoder.name} could not look at a picture`, error)
        }
      }
    }

    if (this.currentState !== 'ended') {
      this.schedule(Math.max(0, this.interval - (Date.now() - startedAt)))
    }
  }

  private report(codes: readonly DetectedCode[], offset: CodePoint): void {
    const now = Date.now()
    const repeatAfter = this.options.repeatAfter ?? DefaultCodeScan.defaultRepeatAfter

    for (const code of codes) {
      const key = `${code.format}:${code.value}`
      const seen = this.lastSeen.get(key)
      this.lastSeen.set(key, now)

      if (seen !== undefined && now - seen < repeatAfter) {
        continue
      }

      const found = shiftCode(code, offset)

      this.emitSafely('code', found, this.logger)
      this.waiters.forEach((waiter) => waiter.resolve(found))
      this.waiters.clear()
    }

    // codes that are long out of sight are forgotten, so the map does not grow for ever
    for (const [key, seen] of this.lastSeen) {
      if (now - seen >= repeatAfter) {
        this.lastSeen.delete(key)
      }
    }
  }

  private end(end: CodeScanEnd): Promise<void> {
    this.ending ??= this.finish(end)

    return this.ending
  }

  private async finish(end: CodeScanEnd): Promise<void> {
    clearTimeout(this.timer)
    this.subscriptions.forEach((subscription) => subscription.unsubscribe())
    this.changeState('ended')

    await this.looking
    this.grabber[Symbol.dispose]()

    const closed = new SessionClosedError('The scan has ended')
    this.waiters.forEach((waiter) => waiter.reject(closed))
    this.waiters.clear()

    this.emitSafely('ended', end, this.logger)
    this.removeAllListeners()
  }

  private changeState(state: CodeScanState): void {
    if (state !== this.currentState && this.currentState !== 'ended') {
      this.currentState = state
      this.emitSafely('statechange', state, this.logger)
    }
  }
}
