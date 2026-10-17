import '../../core/disposable-polyfill.ts'

import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { Logger } from '../../core/logging/logger.ts'
import type { MotionWatch, MotionWatchEvents, MotionWatchOptions } from './motion-watch.ts'

/**
 * Something that announces the events of a sensor: the window of the page.
 */
export interface SensorEventTarget {
  addEventListener(type: string, listener: (event: Event) => void): void
  removeEventListener(type: string, listener: (event: Event) => void): void
}

/**
 * What a watch reads from the events of one sensor.
 */
export interface SensorSource<Value> {
  /**
   * The events to listen to, the preferred first: once one of the preferred has arrived, the others are ignored.
   */
  readonly events: readonly string[]
  /**
   * @returns `undefined` for an event without values
   */
  read(event: Event): Value | undefined
}

export interface MotionWatchTiming {
  /** how long the watch waits for the first value before it says the sensor is unavailable, in milliseconds */
  unavailableAfter?: number
}

/**
 * Where a watch reads from, and whom it tells when it stops.
 */
export interface MotionWatchHost {
  readonly target: SensorEventTarget
  /** called once, when the watch stops */
  stopped(watch: MotionWatch<unknown>): void
}

/**
 * The implementation of {@link MotionWatch}.
 */
export class DefaultMotionWatch<Value> extends EventEmitter<MotionWatchEvents<Value>> implements MotionWatch<Value> {
  private static readonly defaultUnavailableAfter = 1000

  private active = true
  private latest: Value | undefined
  private available: boolean | undefined
  /** the most preferred event that has arrived; the others are ignored from then on */
  private preferred: number
  private lastReported = Number.NEGATIVE_INFINITY
  private pending: ReturnType<typeof setTimeout> | undefined
  private readonly waiting: ReturnType<typeof setTimeout>
  private readonly subscriptions: [string, (event: Event) => void][]

  public constructor(
    private readonly host: MotionWatchHost,
    private readonly source: SensorSource<Value>,
    private readonly options: MotionWatchOptions,
    private readonly logger: Logger,
    timing: MotionWatchTiming = {}
  ) {
    super()

    this.preferred = source.events.length
    this.subscriptions = source.events.map((type, index) => [type, (event: Event) => this.receive(event, index)])
    this.subscriptions.forEach(([type, listener]) => host.target.addEventListener(type, listener))

    this.waiting = setTimeout(
      () => this.markUnavailable(),
      timing.unavailableAfter ?? DefaultMotionWatch.defaultUnavailableAfter
    )
  }

  public get isActive(): boolean {
    return this.active
  }

  public get current(): Value | undefined {
    return this.latest
  }

  public get isAvailable(): boolean | undefined {
    return this.available
  }

  public stop(): void {
    if (!this.active) {
      return
    }

    this.active = false
    clearTimeout(this.waiting)
    clearTimeout(this.pending)
    this.subscriptions.forEach(([type, listener]) => this.host.target.removeEventListener(type, listener))
    this.removeAllListeners()
    this.host.stopped(this)
  }

  /**
   * Calls {@link stop}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.stop()
  }

  private receive(event: Event, index: number): void {
    if (index > this.preferred) {
      return
    }

    const value = this.source.read(event)

    if (value === undefined) {
      // a desktop sends one event without values, and no more
      if (this.available === undefined) {
        this.markUnavailable()
      }

      return
    }

    this.preferred = index
    this.available = true
    clearTimeout(this.waiting)
    this.latest = value
    this.report()
  }

  /**
   * Reports the latest value, or once the rate allows it again, so the last value is never lost.
   */
  private report(): void {
    const rate = this.options.rate
    const interval = rate === undefined || rate <= 0 ? 0 : 1000 / rate
    const wait = this.lastReported + interval - Date.now()

    if (wait > 0) {
      this.pending ??= setTimeout(() => {
        this.pending = undefined
        this.report()
      }, wait)

      return
    }

    this.lastReported = Date.now()

    if (this.latest !== undefined) {
      this.emitSafely('change', this.latest, this.logger)
    }
  }

  private markUnavailable(): void {
    if (this.available === undefined) {
      this.available = false
      this.logger.info(`No values from ${this.source.events.join(' or ')}`)
      this.emitSafely('unavailable', undefined, this.logger)
    }
  }
}
