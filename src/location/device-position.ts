/**
 * Where the device is, or was at `timestamp`. Immutable.
 */
export class DevicePosition {
  private static readonly earthRadius = 6_371_008.8

  public constructor(
    /** in degrees, north is positive */
    public readonly latitude: number,
    /** in degrees, east is positive */
    public readonly longitude: number,
    /** how far the real position can be from this one, in metres */
    public readonly accuracy: number,
    /** when the position was determined, in milliseconds since 1970 */
    public readonly timestamp: number,
    /** in metres above the reference ellipsoid; `undefined` where the device cannot tell */
    public readonly altitude?: number,
    /** in metres */
    public readonly altitudeAccuracy?: number,
    /** the direction of travel in degrees, clockwise from north; `undefined` while the device does not move */
    public readonly heading?: number,
    /** in metres per second */
    public readonly speed?: number
  ) {}

  /**
   * The position as the Geolocation API reports it. Values the browser leaves `null` or `NaN` become `undefined`.
   */
  public static from(position: GeolocationPosition): DevicePosition {
    const { coords } = position

    return new DevicePosition(
      coords.latitude,
      coords.longitude,
      coords.accuracy,
      position.timestamp,
      DevicePosition.optional(coords.altitude),
      DevicePosition.optional(coords.altitudeAccuracy),
      DevicePosition.optional(coords.heading),
      DevicePosition.optional(coords.speed)
    )
  }

  /**
   * The distance to another position along the surface of the earth, in metres.
   */
  public distanceTo(other: Pick<DevicePosition, 'latitude' | 'longitude'>): number {
    const latitude = DevicePosition.radians(other.latitude - this.latitude)
    const longitude = DevicePosition.radians(other.longitude - this.longitude)

    const haversine =
      Math.sin(latitude / 2) ** 2 +
      Math.cos(DevicePosition.radians(this.latitude)) *
        Math.cos(DevicePosition.radians(other.latitude)) *
        Math.sin(longitude / 2) ** 2

    return 2 * DevicePosition.earthRadius * Math.asin(Math.min(1, Math.sqrt(haversine)))
  }

  /**
   * Browsers report what a device cannot tell as `null`, some as `NaN`.
   */
  private static optional(value: number | null): number | undefined {
    return value === null || Number.isNaN(value) ? undefined : value
  }

  private static radians(degrees: number): number {
    return (degrees * Math.PI) / 180
  }
}
