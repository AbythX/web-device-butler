import {
  BinaryCodec,
  type CameraRequirements,
  type CameraSession,
  DefaultDeviceButler,
  type DeviceButler,
  MediaDeviceBusyError,
  StorageQuotaExceededError,
  type Store,
} from '../../../src/index.ts'
import { DemoPage } from '../../shared/demo-page.ts'

/**
 * What is kept about a scan, next to its picture.
 */
interface Scan {
  id: string
  takenAt: number
  width: number
  height: number
  bytes: number
}

/**
 * The use case of a document scanner: a back camera that lights and zooms where the device can, and photos that
 * survive a reload.
 */
class DocumentScanner extends DemoPage {
  private readonly butler: DeviceButler
  /** the pictures, as the bytes of a JPEG */
  private readonly pictures: Promise<Store<Uint8Array>>
  private readonly scans: Promise<Store<Scan>>

  private session: CameraSession | undefined
  /** the object URLs of the pictures on the page, which the browser keeps until they are revoked */
  private shown: string[] = []

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({
      logger: this.logger,
      camera: {
        require: { facing: 'back' },
        // a scanner works without them, so they rank the cameras instead of excluding some
        prefer: { torch: true, zoom: true, width: 1920, height: 1080 },
        // a phone ends the camera of a page in the background; the session starts it again
        autoRecover: true,
      },
      storage: { namespace: 'web-device-butler-demo' },
    })

    // pictures are large: a file system first, then a database, and memory where a browser has neither
    this.pictures = this.butler.storage.open({
      driver: ['opfs', 'indexeddb', 'memory'],
      namespace: 'scans',
      codec: new BinaryCodec(),
    })
    this.scans = this.butler.storage.open<Scan>({ driver: ['indexeddb', 'local', 'memory'], namespace: 'scan-index' })

    this.onClick('start', () => this.start())
    this.onClick('takeover', () => this.start({ whenBusy: 'takeover' }))
    this.onClick('capture', () => this.capture())
    this.onClick('stop', () => this.session?.close())

    void this.run('Loading the scans', async () => {
      // a scan that another tab took or deleted
      ;(await this.scans).on('change', ({ origin }) => {
        if (origin === 'remote') {
          void this.showScans()
        }
      })
      await this.showScans()
    })
  }

  private async start(requirements: Partial<CameraRequirements> = {}): Promise<void> {
    this.element('takeover').hidden = true

    let session: CameraSession

    try {
      session = await this.butler.camera.open(requirements)
    } catch (error) {
      // only one tab can run a camera; the user decides whether this one takes it
      this.element('takeover').hidden = !(error instanceof MediaDeviceBusyError && error.holder === 'other-tab')
      throw error
    }

    session.on('ended', ({ reason }) => {
      this.session = undefined
      this.showCamera()

      if (reason !== 'closed') {
        this.status(reason === 'taken-over' ? 'Another tab took the camera' : 'The camera stopped', true)
      }
    })
    // the camera was started again and delivers through a new stream
    session.on('trackchange', () => this.showCamera())

    this.session = session
  }

  private async capture(): Promise<void> {
    const session = this.session

    if (session === undefined) {
      return
    }

    // a still picture of the camera where the browser can ask for one, which can be larger than the preview;
    // otherwise the picture of the stream
    const picture = await session.takePhoto({ quality: 0.9 })
    const size = await createImageBitmap(picture)

    const scan: Scan = {
      id: crypto.randomUUID(),
      takenAt: Date.now(),
      width: size.width,
      height: size.height,
      bytes: picture.size,
    }

    size.close()

    try {
      await (await this.pictures).set(scan.id, new Uint8Array(await picture.arrayBuffer()))
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) {
        throw new Error(`The storage is full (${DemoPage.bytes(error.space?.available)} left). Delete some scans.`, {
          cause: error,
        })
      }

      throw error
    }

    // the picture first: an entry of the index always has one
    await (await this.scans).set(scan.id, scan)
    await this.showScans()
  }

  private async remove(scan: Scan): Promise<void> {
    await (await this.scans).delete(scan.id)
    await (await this.pictures).delete(scan.id)
    await this.showScans()
  }

  // ---- output ----

  private showCamera(): void {
    const session = this.session
    const video = this.element<HTMLVideoElement>('preview')
    video.hidden = session === undefined
    video.srcObject = session?.stream ?? null
    this.element<HTMLButtonElement>('start').disabled = session !== undefined
    this.element<HTMLButtonElement>('capture').disabled = session === undefined
    this.element<HTMLButtonElement>('stop').disabled = session === undefined

    if (session === undefined) {
      this.element('camera').replaceChildren()
      this.element('controls').replaceChildren()

      return
    }

    const { torch, zoom, descriptor, settings } = session
    this.describe('camera', {
      Camera: `${descriptor.label} (${descriptor.facing})`,
      Delivers: settings.resolution?.toString() ?? 'unknown',
    })

    // a control that the camera does not have is `undefined`, so the page shows what there is
    const controls: HTMLElement[] = []

    if (torch !== undefined) {
      controls.push(this.button(torch.enabled ? 'Light off' : 'Light on', () => torch.toggle()))
    }

    if (zoom !== undefined) {
      const { min, max, step } = zoom.range
      controls.push(this.slider('Zoom', min, max, step ?? 0.1, zoom.level, (level) => zoom.set(level)))
    }

    this.element('controls').replaceChildren(...controls)
  }

  private async showScans(): Promise<void> {
    const pictures = await this.pictures
    const scans: Scan[] = []

    for await (const [, scan] of (await this.scans).entries()) {
      scans.push(scan)
    }

    scans.sort((first, second) => second.takenAt - first.takenAt)

    const urls: string[] = []
    const cards: HTMLLIElement[] = []

    for (const scan of scans) {
      const bytes = await pictures.get(scan.id)

      if (bytes === undefined) {
        continue
      }

      // SAFETY: the store decodes into a buffer of its own, never into shared memory, which is all the type of Blob
      // rules out
      const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
      urls.push(url)

      const image = this.page.createElement('img')
      image.src = url
      image.alt = `Scan of ${new Date(scan.takenAt).toLocaleString()}`
      const details = this.page.createElement('p')
      details.textContent =
        `${new Date(scan.takenAt).toLocaleString()}, ${scan.width}x${scan.height}, ` + DemoPage.bytes(scan.bytes)

      const card = this.page.createElement('li')
      card.append(
        image,
        details,
        this.button('Delete', () => this.remove(scan))
      )
      cards.push(card)
    }

    this.element('scans').replaceChildren(...cards)
    this.shown.forEach((url) => URL.revokeObjectURL(url))
    this.shown = urls

    const space = await this.butler.storage.space()
    this.element('space').textContent =
      `${scans.length} on '${pictures.capabilities.driver}'` +
      (space.isKnown ? `, ${DemoPage.bytes(space.available)} free` : '')
  }

  protected override refresh(): void {
    this.showCamera()
  }
}

Reflect.set(globalThis, 'demo', new DocumentScanner(document))
