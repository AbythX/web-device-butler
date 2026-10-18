import type {
  MotionReadingLike,
  OrientationReadingLike,
  RotationReadingLike,
  VectorReadingLike,
} from '../../core/environment/sensor-events-like.ts'
import type { Attitude, MotionVector, Movement } from './attitude.ts'

type Vector = readonly [number, number, number]

/**
 * Turns what the browser reports, in the frame of the device held the natural way, into values for the screen as it
 * is held.
 *
 * The browser gives three angles, `alpha`, `beta` and `gamma`, applied one after another (Z, X', Y''). They are
 * turned into the rotation from the device to the world (east, north, up) once, and every value is read from it.
 */
export class MotionGeometry {
  private static readonly toRadians = Math.PI / 180
  private static readonly toDegrees = 180 / Math.PI

  /**
   * @param screenAngle how far the picture of the screen is turned, in degrees clockwise
   * @returns `undefined` where the reading has no angles, as the one a desktop sends
   */
  public static attitude(reading: OrientationReadingLike, screenAngle: number): Attitude | undefined {
    const { alpha, beta, gamma } = reading

    if (beta === null || gamma === null) {
      return undefined
    }

    // where up is, in the frame of the device: the bottom row of the rotation, which does not depend on alpha
    const up = MotionGeometry.toScreen(MotionGeometry.upOf(beta, gamma), screenAngle)

    return {
      pitch: Math.atan2(up[1], up[2]) * MotionGeometry.toDegrees,
      roll: Math.atan2(-up[0], Math.hypot(up[1], up[2])) * MotionGeometry.toDegrees,
      heading: MotionGeometry.headingOf(reading, screenAngle, Math.abs(up[2]) >= Math.SQRT1_2),
      raw: {
        alpha: alpha ?? undefined,
        beta,
        gamma,
        absolute: reading.absolute === true,
      },
    }
  }

  /**
   * @param screenAngle how far the picture of the screen is turned, in degrees clockwise
   * @returns `undefined` where the reading has no values at all
   */
  public static movement(reading: MotionReadingLike, screenAngle: number): Movement | undefined {
    const acceleration = MotionGeometry.vectorOf(reading.acceleration, screenAngle)
    const accelerationIncludingGravity = MotionGeometry.vectorOf(reading.accelerationIncludingGravity, screenAngle)
    const rotationRate = MotionGeometry.rotationOf(reading.rotationRate, screenAngle)

    if (acceleration === undefined && accelerationIncludingGravity === undefined && rotationRate === undefined) {
      return undefined
    }

    return { acceleration, accelerationIncludingGravity, rotationRate, interval: reading.interval }
  }

  /**
   * The heading of the top edge of the screen while the device lies more flat than upright, of its back otherwise.
   * Safari reports its compass on its own; elsewhere it is read from `alpha`, where that is measured from north.
   */
  private static headingOf(reading: OrientationReadingLike, screenAngle: number, isFlat: boolean): number | undefined {
    const { webkitCompassHeading, webkitCompassAccuracy, absolute, alpha, beta, gamma } = reading

    if (typeof webkitCompassHeading === 'number') {
      const isTrusted = webkitCompassAccuracy === undefined || webkitCompassAccuracy >= 0

      return isTrusted ? MotionGeometry.normalized(webkitCompassHeading + screenAngle) : undefined
    }

    if (absolute !== true || alpha === null || beta === null || gamma === null) {
      return undefined
    }

    const radians = screenAngle * MotionGeometry.toRadians
    // the top edge of the screen, or the back of the device, in the frame of the device
    const direction: Vector = isFlat ? [Math.sin(radians), Math.cos(radians), 0] : [0, 0, -1]
    const [east, north] = MotionGeometry.rotate(alpha, beta, gamma, direction)

    if (Math.hypot(east, north) < 1e-6) {
      return undefined
    }

    return MotionGeometry.normalized(Math.atan2(east, north) * MotionGeometry.toDegrees)
  }

  /**
   * The direction up, in the frame of the device.
   */
  private static upOf(beta: number, gamma: number): Vector {
    const b = beta * MotionGeometry.toRadians
    const g = gamma * MotionGeometry.toRadians

    return [-Math.cos(b) * Math.sin(g), Math.sin(b), Math.cos(b) * Math.cos(g)]
  }

  /**
   * A direction of the device in the frame of the world: east, north, up.
   */
  private static rotate(alpha: number, beta: number, gamma: number, [x, y, z]: Vector): Vector {
    const [ca, sa] = MotionGeometry.cosSin(alpha)
    const [cb, sb] = MotionGeometry.cosSin(beta)
    const [cg, sg] = MotionGeometry.cosSin(gamma)

    return [
      (ca * cg - sa * sb * sg) * x - sa * cb * y + (ca * sg + sa * sb * cg) * z,
      (sa * cg + ca * sb * sg) * x + ca * cb * y + (sa * sg - ca * sb * cg) * z,
      -cb * sg * x + sb * y + cb * cg * z,
    ]
  }

  /**
   * A vector of the device in the frame of the screen as it is held.
   */
  private static toScreen([x, y, z]: Vector, screenAngle: number): Vector {
    const [cos, sin] = MotionGeometry.cosSin(screenAngle)

    return [x * cos - y * sin, x * sin + y * cos, z]
  }

  private static vectorOf(reading: VectorReadingLike | null, screenAngle: number): MotionVector | undefined {
    if (reading === null || reading.x === null || reading.y === null || reading.z === null) {
      return undefined
    }

    const [x, y, z] = MotionGeometry.toScreen([reading.x, reading.y, reading.z], screenAngle)

    return { x, y, z }
  }

  /**
   * `beta` turns around the x axis of the device, `gamma` around its y axis and `alpha` around its z axis.
   */
  private static rotationOf(reading: RotationReadingLike | null, screenAngle: number): MotionVector | undefined {
    if (reading === null || reading.alpha === null || reading.beta === null || reading.gamma === null) {
      return undefined
    }

    const [x, y, z] = MotionGeometry.toScreen([reading.beta, reading.gamma, reading.alpha], screenAngle)

    return { x, y, z }
  }

  private static cosSin(degrees: number): [number, number] {
    const radians = degrees * MotionGeometry.toRadians

    return [Math.cos(radians), Math.sin(radians)]
  }

  private static normalized(degrees: number): number {
    return ((degrees % 360) + 360) % 360
  }
}
