import type {
  MotionReadingLike,
  OrientationReadingLike,
  RotationReadingLike,
  VectorReadingLike,
} from '../../core/environment/sensor-events-like.ts'

/**
 * Reads the values of the events of the sensors. The events of the browsers differ in which fields they fill: a
 * field a browser does not fill is `null`, missing or not a number, so every field is checked on its own.
 */
export class SensorReadings {
  /**
   * What a `deviceorientation` or `deviceorientationabsolute` event carries, with the compass Safari adds.
   */
  public static orientationOf(event: DeviceOrientationEvent): OrientationReadingLike {
    return {
      alpha: SensorReadings.numberOf(event.alpha),
      beta: SensorReadings.numberOf(event.beta),
      gamma: SensorReadings.numberOf(event.gamma),
      absolute: event.absolute === true,
      webkitCompassHeading:
        'webkitCompassHeading' in event
          ? (SensorReadings.numberOf(event.webkitCompassHeading) ?? undefined)
          : undefined,
      webkitCompassAccuracy:
        'webkitCompassAccuracy' in event
          ? (SensorReadings.numberOf(event.webkitCompassAccuracy) ?? undefined)
          : undefined,
    }
  }

  /**
   * What a `devicemotion` event carries.
   */
  public static motionOf(event: DeviceMotionEvent): MotionReadingLike {
    return {
      acceleration: SensorReadings.vectorOf(event.acceleration),
      accelerationIncludingGravity: SensorReadings.vectorOf(event.accelerationIncludingGravity),
      rotationRate: SensorReadings.rotationOf(event.rotationRate),
      interval: SensorReadings.numberOf(event.interval) ?? 0,
    }
  }

  private static vectorOf(value: DeviceMotionEventAcceleration | null | undefined): VectorReadingLike | null {
    if (value === null || value === undefined) {
      return null
    }

    return {
      x: SensorReadings.numberOf(value.x),
      y: SensorReadings.numberOf(value.y),
      z: SensorReadings.numberOf(value.z),
    }
  }

  private static rotationOf(value: DeviceMotionEventRotationRate | null | undefined): RotationReadingLike | null {
    if (value === null || value === undefined) {
      return null
    }

    return {
      alpha: SensorReadings.numberOf(value.alpha),
      beta: SensorReadings.numberOf(value.beta),
      gamma: SensorReadings.numberOf(value.gamma),
    }
  }

  private static numberOf(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }
}
