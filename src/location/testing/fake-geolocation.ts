interface Request {
  readonly success: PositionCallback
  readonly failure: PositionErrorCallback | null | undefined
  readonly options: PositionOptions | undefined
}

/**
 * `navigator.geolocation` for specs. Nothing is answered by itself: a spec says where the device is with
 * {@link moveTo} and what goes wrong with {@link fail}.
 */
export class FakeGeolocation {
  public static readonly permissionDenied = 1
  public static readonly positionUnavailable = 2
  public static readonly timeout = 3

  /** the requests of `getCurrentPosition` that were not answered yet */
  public readonly pending: Request[] = []
  /** the running watches, by their id */
  public readonly watches = new Map<number, Request>()
  /** the options of every call, in order */
  public readonly calls: (PositionOptions | undefined)[] = []

  private nextWatch = 1

  public getCurrentPosition(
    success: PositionCallback,
    failure?: PositionErrorCallback | null,
    options?: PositionOptions
  ): void {
    this.calls.push(options)
    this.pending.push({ success, failure, options })
  }

  public watchPosition(
    success: PositionCallback,
    failure?: PositionErrorCallback | null,
    options?: PositionOptions
  ): number {
    this.calls.push(options)
    this.watches.set(this.nextWatch, { success, failure, options })

    return this.nextWatch++
  }

  public clearWatch(identifier: number): void {
    this.watches.delete(identifier)
  }

  /**
   * The device is here now: answers every waiting request and tells every watch.
   */
  public moveTo(coords: Partial<GeolocationCoordinates>, timestamp = 1_700_000_000_000): void {
    const position = {
      timestamp,
      coords: {
        latitude: 0,
        longitude: 0,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        ...coords,
      },
    } as GeolocationPosition

    for (const { success } of this.everyone()) {
      success(position)
    }
  }

  /**
   * Determining the position goes wrong for every waiting request and every watch.
   */
  public fail(code: number, message = 'failed'): void {
    const error = { code, message } as GeolocationPositionError

    for (const { failure } of this.everyone()) {
      failure?.(error)
    }
  }

  private everyone(): Request[] {
    return [...this.pending.splice(0), ...this.watches.values()]
  }
}
