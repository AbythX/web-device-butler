import type { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import type { SensorEventFactory } from '../core/environment/sensor-events-like.ts'

/**
 * Whether the page can read how the device is turned and moves. Shared by the sensors and by the request of their
 * permission, so both say the same.
 */
export class MotionSupport {
  /**
   * `false` outside a secure context, without a window to listen on, and where the browser reports neither how the
   * device is turned nor how it moves.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return MotionSupport.resolveFor(environment).length > 0
  }

  /**
   * Whether the page can follow how the device is turned (`deviceorientation`).
   */
  public static canWatchAttitudeIn(environment: BrowserEnvironment): boolean {
    return MotionSupport.usable(environment, environment.DeviceOrientationEvent) !== undefined
  }

  /**
   * Whether the page can follow how the device moves (`devicemotion`).
   */
  public static canWatchMovementIn(environment: BrowserEnvironment): boolean {
    return MotionSupport.usable(environment, environment.DeviceMotionEvent) !== undefined
  }

  /**
   * The constructors of the events the page can listen to; Safari on iOS asks the user through them.
   */
  public static resolveFor(environment: BrowserEnvironment): SensorEventFactory[] {
    return [environment.DeviceOrientationEvent, environment.DeviceMotionEvent].flatMap(
      (factory) => MotionSupport.usable(environment, factory) ?? []
    )
  }

  private static usable(
    environment: BrowserEnvironment,
    factory: SensorEventFactory | undefined
  ): SensorEventFactory | undefined {
    return environment.isBrowser ? environment.secured(factory) : undefined
  }
}
