import {
  type CameraDescriptor,
  type CameraRequirements,
  type CameraSession,
  type CameraTraits,
  DefaultDeviceButler,
  type DeviceButler,
} from '../../src/index.ts'
import { DemoPage } from '../shared/demo-page.ts'

/**
 * The demo page: lists every camera with what the library found out about it and lets a tester try each feature.
 * It is the tool for collecting the device matrix.
 */
class CameraDemo extends DemoPage {
  private readonly butler: DeviceButler

  private cameras: readonly CameraDescriptor[] = []
  private selected: CameraDescriptor | undefined
  private session: CameraSession | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger })

    this.butler.camera.on('accesschange', () => this.showAccess())
    this.butler.camera.on('availabilitychange', (availability) => {
      this.logger.info(`availabilitychange: ${availability}`)
      this.showFacts()
    })
    this.butler.camera.on('change', (cameras) => {
      this.logger.info(`change: ${cameras.length} cameras`)
      this.showCameras(cameras)
    })

    this.onClick('prepare', () => this.prepare())
    this.onClick('open', () => this.open(this.requirements))
    this.onClick('probe', async () => this.showCameras(await this.butler.camera.list({ detail: 'probed' })))
    this.onClick('list', async () => this.showCameras(await this.butler.camera.list()))
    this.onClick('forget', () => this.butler.camera.forget())
    this.onClick('switch', () => this.switchFacing())
    this.onClick('half', () => this.session?.configure({ width: 1280, height: 720 }))
    this.onClick('close', () => this.session?.close())
    this.onClick('report', async () => this.showReport())
    this.onClick('copy', () => this.butler.clipboard.writeText(this.element('report-output').textContent ?? ''))

    const allowTakeover = this.element<HTMLInputElement>('allow-takeover')
    allowTakeover.addEventListener('change', () => {
      if (this.session !== undefined) {
        this.session.allowTakeover = allowTakeover.checked
      }
    })

    this.showFacts()
    this.showAccess()
  }

  /**
   * What the form asks of a camera.
   */
  private get requirements(): CameraRequirements {
    const form = new FormData(this.element<HTMLFormElement>('requirements'))
    const [width, height] = String(form.get('resolution')).split('x').map(Number)

    const require: CameraTraits = {}
    const prefer: CameraTraits = {}
    /** where the form puts a trait: among what a camera must have, or among what it should have */
    const placeOf = (name: string) => ({ require, prefer })[String(form.get(name))]

    for (const name of ['torch', 'zoom', 'focus'] as const) {
      const traits = placeOf(name)

      if (traits !== undefined) {
        traits[name] = true
      }
    }

    const facing = placeOf('facingPlace')

    if (facing !== undefined) {
      // SAFETY: the select of the form only offers the facings of the type, and an empty choice
      facing.facing = (form.get('facing') || undefined) as CameraTraits['facing']
    }

    const resolution = placeOf('resolutionPlace')

    if (resolution !== undefined && width !== undefined && height !== undefined && !Number.isNaN(height)) {
      resolution.width = width
      resolution.height = height
    }

    return {
      require,
      prefer,
      // SAFETY: the select of the form only offers the strategies of the type
      strategy: form.get('strategy') as CameraRequirements['strategy'],
      // SAFETY: the select of the form only offers the busy policies of the type
      whenBusy: form.get('whenBusy') as CameraRequirements['whenBusy'],
      autoRecover: form.has('autoRecover'),
    }
  }

  private async prepare(): Promise<void> {
    // the form is the configuration: what prepare() prepares is what open() uses afterwards
    this.butler.camera.configure(this.requirements)

    const { camera } = await this.butler.prepare({ camera: true })
    this.selected = camera?.selected
    this.showCameras(camera?.cameras ?? [])

    if (camera?.error !== undefined) {
      throw camera.error
    }

    this.status(
      `prepare(): permission ${camera?.permission}, selected '${camera?.selected?.label}', ` +
        `resolution available: ${camera?.isResolutionAvailable}`
    )
  }

  private async open(requirements: Partial<CameraRequirements>): Promise<void> {
    await this.session?.close()

    const session = await this.butler.camera.open(requirements)
    this.session = session
    this.selected = session.descriptor
    session.allowTakeover = this.element<HTMLInputElement>('allow-takeover').checked

    session.on('statechange', (state) => {
      this.logger.info(`statechange: ${state}`)
      this.showSession()
    })
    session.on('settingschange', (settings) => {
      this.logger.info(`settingschange: ${settings.resolution?.toString()} @ ${settings.frameRate}`)
      this.showSession()
    })
    session.on('devicechange', (camera) => {
      this.logger.info(`devicechange: ${camera.label}`)
      this.selected = camera
      this.showSession()
    })
    session.on('ended', ({ reason }) => {
      this.logger.info(`ended: ${reason}`)
      this.session = undefined
      this.showSession()
    })

    this.showCameras(await this.butler.camera.list())
    this.showSession()
  }

  private async switchFacing(): Promise<void> {
    const facing = this.session?.descriptor.facing === 'front' ? 'back' : 'front'
    // the other side of a phone has neither torch nor zoom on most devices
    await this.session?.switchTo({ require: { facing } })
    this.showCameras(await this.butler.camera.list())
  }

  // ---- output ----

  private showFacts(): void {
    const { platform, coordination, camera } = this.butler

    this.describe('facts', {
      'User agent': navigator.userAgent,
      Platform: platform.isIos ? 'iOS' : platform.isAndroid ? 'Android' : 'other',
      'Secure context': String(globalThis.isSecureContext),
      'Cross-tab locks': String(coordination.isCrossTab),
      Availability: camera.availability,
    })
  }

  private showAccess(): void {
    const { front, back, any } = this.butler.camera.access
    this.element('access').textContent = `access: back ${back}, front ${front}, any ${any}`
  }

  private showCameras(cameras: readonly CameraDescriptor[]): void {
    this.cameras = cameras

    const rows = cameras.map((camera) => {
      const { features } = camera
      const row = this.page.createElement('tr')
      row.classList.toggle('selected', camera.id === this.selected?.id)
      row.classList.toggle('running', camera.id === this.session?.descriptor.id)

      const isProbed = camera.detail === 'probed'

      const cells = [
        camera.label || camera.id || '(no label)',
        camera.facing,
        camera.detail,
        isProbed ? (features.torch ? 'yes' : 'no') : '?',
        isProbed ? (features.zoom === undefined ? 'no' : `${features.zoom.min} to ${features.zoom.max}`) : '?',
        isProbed ? features.focusModes.join(', ') || 'no' : '?',
        features.maxResolution?.toString() ?? '?',
        features.maxFrameRate === undefined ? '?' : String(Math.round(features.maxFrameRate)),
      ]

      for (const text of cells) {
        row.insertCell().textContent = text
      }

      const open = this.page.createElement('button')
      open.textContent = 'open({ id })'
      open.addEventListener('click', () => void this.run(`open ${camera.label}`, () => this.open({ id: camera.id })))
      row.insertCell().append(open)

      return row
    })

    this.element('cameras').replaceChildren(...rows)
  }

  private showSession(): void {
    const session = this.session
    this.element('session').hidden = session === undefined
    this.element<HTMLVideoElement>('preview').srcObject = session?.stream ?? null

    if (session === undefined) {
      return
    }

    const { settings, descriptor } = session
    this.element('session-state').textContent = session.state
    this.describe('session-facts', {
      Camera: `${descriptor.label} (${descriptor.facing})`,
      Delivers: `${settings.resolution?.toString() ?? '?'} @ ${settings.frameRate ?? '?'} fps`,
      Torch: session.torch === undefined ? 'not available' : session.torch.enabled ? 'on' : 'off',
      Zoom: session.zoom === undefined ? 'not available' : String(session.zoom.level),
      Focus: session.focus === undefined ? 'not available' : (session.focus.mode ?? 'not reported'),
    })
    this.showControls(session)
  }

  private showControls(session: CameraSession): void {
    const controls: HTMLElement[] = []
    const { torch, zoom, focus } = session

    if (torch !== undefined) {
      controls.push(this.button('torch.toggle()', () => torch.toggle()))
    }

    if (zoom !== undefined) {
      const { min, max, step } = zoom.range
      controls.push(this.slider('zoom', min, max, step ?? 0.1, zoom.level, (level) => zoom.set(level)))
    }

    if (focus !== undefined) {
      for (const mode of focus.modes) {
        controls.push(this.button(`focus.setMode('${mode}')`, () => focus.setMode(mode)))
      }

      const range = focus.distanceRange

      if (range !== undefined) {
        controls.push(
          this.slider('focus distance', range.min, range.max, range.step ?? 0.1, focus.distance ?? range.min, (value) =>
            focus.setDistance(value)
          )
        )
      }
    }

    this.element('controls').replaceChildren(...controls)
  }

  private async showReport(): Promise<void> {
    const { platform, coordination, camera } = this.butler

    const report = {
      date: new Date().toISOString(),
      notes: this.element<HTMLTextAreaElement>('notes').value,
      userAgent: navigator.userAgent,
      platform: platform.isIos ? 'ios' : platform.isAndroid ? 'android' : 'other',
      crossTabLocks: coordination.isCrossTab,
      access: { back: camera.access.back, front: camera.access.front, any: camera.access.any },
      requirements: this.requirements,
      selected: this.selected?.id,
      cameras: this.cameras.map((descriptor) => ({ detail: descriptor.detail, ...descriptor.toJSON() })),
      session:
        this.session === undefined
          ? undefined
          : {
              camera: this.session.descriptor.id,
              settings: this.session.settings,
              trackSettings: this.session.track.getSettings(),
              trackCapabilities: this.session.track.getCapabilities?.(),
            },
      timings: this.timings,
    }

    this.element('report-output').textContent = JSON.stringify(report, undefined, 2)
  }

  protected override refresh(): void {
    this.showFacts()
    this.showAccess()

    if (this.session !== undefined) {
      this.showSession()
    }
  }
}

Reflect.set(globalThis, 'demo', new CameraDemo(document))
