import '../core/disposable-polyfill.ts'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import { WatchRegistry } from '../core/lifetime/watch-registry.ts'
import type { Logger } from '../core/logging/logger.ts'
import { NullLogger } from '../core/logging/null-logger.ts'
import type { DeviceMotion } from './device-motion.ts'
import { MotionSupport } from './motion-support.ts'
import type { Attitude, Movement } from './model/attitude.ts'
import { MotionGeometry } from './model/motion-geometry.ts'
import { SensorReadings } from './model/sensor-readings.ts'
import { DefaultMotionWatch, type MotionWatchHost, type SensorSource } from './watch/default-motion-watch.ts'
import type { MotionWatchTiming } from './watch/motion-watch-timing.ts'
import type { MotionWatch, MotionWatchOptions } from './watch/motion-watch.ts'

/**
 * The implementation of {@link DeviceMotion}.
 */
export class DefaultDeviceMotion implements DeviceMotion {
  /**
   * For applications that only use the sensors. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): DeviceMotion {
    return new DefaultDeviceMotion(environment, logger)
  }

  private readonly watches = new WatchRegistry<MotionWatch<unknown>>()

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger,
    private readonly timing: MotionWatchTiming = {}
  ) {}

  public get isSupported(): boolean {
    return MotionSupport.isSupportedIn(this.environment)
  }

  public watchAttitude(options: MotionWatchOptions = {}): MotionWatch<Attitude> {
    this.assertSupported(MotionSupport.canWatchAttitudeIn(this.environment), 'DeviceOrientationEvent')

    return this.watch<Attitude>(options, {
      // Chromium tells north only in an event of its own, and sends both
      events: ['deviceorientationabsolute', 'deviceorientation'],
      read: (event) =>
        MotionGeometry.attitude(
          // SAFETY: the watch only listens to the events of the orientation, whose fields are checked one by one
          SensorReadings.orientationOf(event as DeviceOrientationEvent),
          this.environment.screenAngle
        ),
    })
  }

  public watchMotion(options: MotionWatchOptions = {}): MotionWatch<Movement> {
    this.assertSupported(MotionSupport.canWatchMovementIn(this.environment), 'DeviceMotionEvent')

    return this.watch<Movement>(options, {
      events: ['devicemotion'],
      read: (event) =>
        // SAFETY: the watch only listens to the event of the motion, whose fields are checked one by one
        MotionGeometry.movement(SensorReadings.motionOf(event as DeviceMotionEvent), this.environment.screenAngle),
    })
  }

  public dispose(): void {
    this.watches.endAll()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  private watch<Value>(options: MotionWatchOptions, source: SensorSource<Value>): MotionWatch<Value> {
    const host: MotionWatchHost = {
      target: this.environment.window,
      // a watch the application stops is forgotten
      stopped: (watch) => this.watches.forget(watch),
    }

    return this.watches.track(new DefaultMotionWatch(host, source, options, this.logger, this.timing))
  }

  private assertSupported(canWatch: boolean, feature: string): void {
    if (!canWatch) {
      throw new UnsupportedError(feature)
    }
  }
}
