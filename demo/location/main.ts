import {
  DefaultDeviceButler,
  type DeviceButler,
  type DevicePermissionName,
  type DevicePermissionState,
  type DevicePosition,
  type LocationOptions,
  type LocationWatch,
} from '../../src/index.ts'
import { DemoPage } from '../shared/demo-page.ts'

/**
 * The demo page of the small areas: the location, the orientation, the platform and the permissions.
 */
class LocationDemo extends DemoPage {
  private static readonly permissions: readonly DevicePermissionName[] = [
    'camera',
    'microphone',
    'geolocation',
    'persistent-storage',
  ]

  private readonly butler: DeviceButler
  private readonly states = new Map<DevicePermissionName, DevicePermissionState>()

  private watch: LocationWatch | undefined
  /** where the watch started, to show how far the device moved */
  private origin: DevicePosition | undefined

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

    this.showFacts()
    this.showPermissions()
  }

  private get options(): LocationOptions {
    const form = new FormData(this.element<HTMLFormElement>('options'))

    const optional = (name: string): number | undefined => {
      const value = String(form.get(name))

      return value === '' ? undefined : Number(value)
    }

    return { highAccuracy: form.has('highAccuracy'), timeout: optional('timeout'), maximumAge: optional('maximumAge') }
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

  // ---- output ----

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
