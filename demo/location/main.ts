import {
  type Attitude,
  DefaultDeviceButler,
  type DeviceButler,
  type DevicePermissionName,
  type DevicePermissionState,
  type DevicePosition,
  type LocationOptions,
  type LocationTraits,
  type LocationWatch,
  type MotionWatch,
  type Movement,
} from '../../src/index.ts'
import { DemoPage } from '../shared/demo-page.ts'

/**
 * The demo page of the small areas: the location, the orientation, the sensors, the platform and the permissions.
 */
class LocationDemo extends DemoPage {
  private static readonly permissions: readonly DevicePermissionName[] = [
    'camera',
    'microphone',
    'geolocation',
    'persistent-storage',
    'motion',
  ]

  private readonly butler: DeviceButler
  private readonly states = new Map<DevicePermissionName, DevicePermissionState>()

  private watch: LocationWatch | undefined
  /** where the watch started, to show how far the device moved */
  private origin: DevicePosition | undefined
  private attitude: MotionWatch<Attitude> | undefined
  private movement: MotionWatch<Movement> | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger })

    this.butler.orientation.on('change', (orientation) => {
      this.logger.info(`orientation change: ${orientation}`)
      this.showFacts()
    })
    this.butler.permission.on('change', ({ name, state }) => {
      this.logger.info(`permission change: ${name} is ${state}`)
      this.states.set(name, state)
      this.showPermissions()
    })

    this.onClick('query', () => this.queryAll())
    this.onClick('current', async () => this.showPosition(await this.butler.location.current(this.options)))
    this.onClick('watch', () => this.startWatch())
    this.onClick('stop', () => this.watch?.stop())

    this.onClick('motion-request', () => this.request('motion'))
    this.onClick('motion-start', () => this.startMotion())
    this.onClick('motion-stop', () => this.stopMotion())

    this.showFacts()
    this.showPermissions()
  }

  private get options(): LocationOptions {
    const form = new FormData(this.element<HTMLFormElement>('options'))

    const optional = (name: string): number | undefined => {
      const value = String(form.get(name))

      return value === '' ? undefined : Number(value)
    }

    const require: LocationTraits = { accuracy: optional('requireAccuracy') }
    const prefer: LocationTraits = { accuracy: optional('preferAccuracy') }

    for (const name of ['altitude', 'heading', 'speed'] as const) {
      const traits = { require, prefer }[String(form.get(name))]

      if (traits !== undefined) {
        traits[name] = true
      }
    }

    return {
      require,
      prefer,
      highAccuracy: form.has('highAccuracy'),
      timeout: optional('timeout'),
      maximumAge: optional('maximumAge'),
    }
  }

  private async queryAll(): Promise<void> {
    for (const name of LocationDemo.permissions) {
      this.states.set(name, await this.butler.permission.query(name))
    }

    this.showPermissions()
  }

  private async request(name: DevicePermissionName): Promise<void> {
    this.states.set(name, await this.butler.permission.request(name))
    this.showPermissions()
  }

  private startWatch(): void {
    this.watch?.stop()
    this.origin = undefined
    this.element('positions').replaceChildren()

    const watch = this.butler.location.watch(this.options)
    watch.on('position', (position) => {
      this.origin ??= position
      this.showPosition(position)
      this.element('positions').prepend(
        this.row(
          new Date(position.timestamp).toLocaleTimeString(),
          position.latitude.toFixed(6),
          position.longitude.toFixed(6),
          `${Math.round(position.accuracy)} m`,
          `${Math.round(this.origin.distanceTo(position))} m`
        )
      )
    })
    watch.on('error', (error) => {
      // the watch goes on unless the permission was refused
      this.status(`watch: ${error.name}: ${error.message}${watch.isActive ? '' : ' (the watch has stopped)'}`, true)
      this.logger.error('watch error', error)
    })
    this.watch = watch
  }

  private startMotion(): void {
    this.stopMotion()

    // a few values per second are enough to look at, and keep the page calm
    const attitude = this.butler.motion.watchAttitude({ rate: 20 })
    const movement = this.butler.motion.watchMotion({ rate: 5 })

    attitude.on('change', () => this.showMotion())
    movement.on('change', () => this.showMotion())
    attitude.on('unavailable', () => this.logger.info('The device does not report how it is turned'))
    movement.on('unavailable', () => this.logger.info('The device does not report how it moves'))

    this.attitude = attitude
    this.movement = movement
  }

  private stopMotion(): void {
    this.attitude?.stop()
    this.movement?.stop()
  }

  // ---- output ----

  private showMotion(): void {
    const attitude = this.attitude?.current
    const movement = this.movement?.current
    const gravity = movement?.accelerationIncludingGravity

    this.describe('motion', {
      Pitch: LocationDemo.degrees(attitude?.pitch),
      Roll: LocationDemo.degrees(attitude?.roll),
      Heading: LocationDemo.degrees(attitude?.heading),
      'Raw alpha, beta, gamma':
        attitude === undefined
          ? 'none'
          : `${LocationDemo.degrees(attitude.raw.alpha)}, ${LocationDemo.degrees(attitude.raw.beta)}, ${LocationDemo.degrees(attitude.raw.gamma)}` +
            (attitude.raw.absolute ? ', from north' : ''),
      Gravity:
        gravity === undefined
          ? 'not reported'
          : `${gravity.x.toFixed(1)}, ${gravity.y.toFixed(1)}, ${gravity.z.toFixed(1)}`,
      Available: `${String(this.attitude?.isAvailable ?? 'unknown')}, ${String(this.movement?.isAvailable ?? 'unknown')}`,
    })

    // the needle points north: against the heading of the screen
    this.element('needle').style.transform = `rotate(${-(attitude?.heading ?? 0)}deg)`
    // the bubble goes to the side that is up, as in a spirit level
    this.element('bubble').style.translate =
      `${LocationDemo.clamp(-(attitude?.roll ?? 0))}% ${LocationDemo.clamp(attitude?.pitch ?? 0)}%`
  }

  private showFacts(): void {
    const { platform, orientation, location, coordination } = this.butler

    this.describe('facts', {
      'User agent': navigator.userAgent,
      Platform: platform.isIos ? 'iOS' : platform.isAndroid ? 'Android' : 'other',
      Orientation: orientation.current ?? 'unknown',
      'Secure context': String(globalThis.isSecureContext),
      'Location supported': String(location.isSupported),
      'Cross-tab locks': String(coordination.isCrossTab),
      Watch: this.watch === undefined ? 'none' : this.watch.isActive ? 'active' : 'stopped',
    })
  }

  private showPermissions(): void {
    const rows = LocationDemo.permissions.map((name) =>
      this.row(
        name,
        this.states.get(name) ?? 'not asked',
        this.button(`request('${name}')`, () => this.request(name))
      )
    )

    this.element('permissions').replaceChildren(...rows)
  }

  private showPosition(position: DevicePosition): void {
    this.describe('position', {
      Latitude: position.latitude.toFixed(6),
      Longitude: position.longitude.toFixed(6),
      Accuracy: `${Math.round(position.accuracy)} m`,
      Altitude: LocationDemo.optional(position.altitude, 'm'),
      Heading: LocationDemo.optional(position.heading, '°'),
      Speed: LocationDemo.optional(position.speed, 'm/s'),
      Determined: new Date(position.timestamp).toLocaleTimeString(),
    })
  }

  private static degrees(value: number | undefined): string {
    return value === undefined ? 'not reported' : `${Math.round(value)}°`
  }

  /**
   * How far the bubble of the level moves, in percent of its size.
   */
  private static clamp(value: number): number {
    return Math.max(-40, Math.min(40, value))
  }

  /**
   * What a device cannot tell is `undefined`.
   */
  private static optional(value: number | undefined, unit: string): string {
    return value === undefined ? 'not reported' : `${value.toFixed(1)} ${unit}`
  }

  protected override refresh(): void {
    this.showFacts()
  }
}

Reflect.set(globalThis, 'demo', new LocationDemo(document))
