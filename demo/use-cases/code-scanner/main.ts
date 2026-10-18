/// <reference types="vite/client" />
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

import { ZxingCodeDecoder } from '../../../src/adapters/zxing/index.ts'
import {
  type CameraSession,
  type CodeDecoder,
  type CodeFormat,
  type CodeScan,
  type CodeScanOptions,
  DefaultDeviceButler,
  type DetectedCode,
  type DeviceButler,
} from '../../../src/index.ts'
import { DemoPage } from '../../shared/demo-page.ts'

/**
 * The use case of a code scanner: the back camera, looked at for codes while it runs, and a picture the user
 * chooses. The code detector of the browser where it has one, zxing-wasm everywhere else.
 */
class CodeScanner extends DemoPage {
  private readonly butler: DeviceButler
  /** loaded on the first picture it looks at */
  private readonly zxing: CodeDecoder = new ZxingCodeDecoder({ wasmUrl })

  private session: CameraSession | undefined
  private scan: CodeScan | undefined
  private clearOverlay: ReturnType<typeof setTimeout> | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({
      logger: this.logger,
      camera: {
        require: { facing: 'back' },
        // a code is read best from a sharp picture, and in the dark with light
        prefer: { focus: true, torch: true, width: 1280, height: 720 },
      },
      // without a code detector of the browser, zxing-wasm reads the codes
      scanner: this.hasNoDetector() ? { decoder: this.zxing } : {},
    })

    this.onClick('start', () => this.start())
    this.onClick('stop', () => this.stop())
    this.onClick('torch', () => this.session?.torch?.toggle())

    const picture = this.element<HTMLInputElement>('picture')
    this.onClick('choose', () => picture.click())
    picture.addEventListener('change', () => {
      const [file] = picture.files ?? []
      picture.value = ''

      if (file !== undefined) {
        void this.run('Reading the picture', () => this.read(file))
      }
    })

    void this.run('Looking at the decoders', () => this.showFacts())
  }

  private async start(): Promise<void> {
    await this.stop()

    const session = await this.butler.camera.open()
    this.session = session
    this.element<HTMLVideoElement>('preview').srcObject = session.stream

    const scan = this.butler.scanner.scan(session, this.options())
    this.scan = scan

    scan.on('code', (code) => this.show(code, 'camera'))
    scan.on('ended', ({ reason }) => this.logger.info(`The scan ended: ${reason}`))

    await this.showFacts()
  }

  private async stop(): Promise<void> {
    await this.scan?.stop()
    await this.session?.close()
    this.scan = undefined
    this.session = undefined
    await this.showFacts()
  }

  private async read(file: File): Promise<void> {
    const codes = await this.butler.scanner.detect(file, this.options())

    if (codes.length === 0) {
      this.status('No code in the picture')
    }

    codes.forEach((code) => this.show(code, file.name))
  }

  /**
   * What the form asks for.
   */
  private options(): CodeScanOptions {
    const form = new FormData(this.element<HTMLFormElement>('options'))
    // SAFETY: the values of the checkboxes are formats of the library
    const formats = form.getAll('format') as CodeFormat[]

    return {
      formats,
      region: form.has('middle') ? { x: 0.2, y: 0.3, width: 0.6, height: 0.4 } : undefined,
      decoder: form.has('zxing') ? this.zxing : undefined,
    }
  }

  private hasNoDetector(): boolean {
    return !('BarcodeDetector' in globalThis)
  }

  // ---- output ----

  private show(code: DetectedCode, from: string): void {
    this.logger.info(`${code.format}: ${code.value}`)
    this.element('codes').prepend(this.row(new Date().toLocaleTimeString(), code.format, code.value, from))

    if (from === 'camera') {
      this.outline(code)
    }
  }

  /**
   * Draws the corners of the code over the preview. The canvas has the size of the picture, and the page scales both
   * the same.
   */
  private outline(code: DetectedCode): void {
    const video = this.element<HTMLVideoElement>('preview')
    const canvas = this.element<HTMLCanvasElement>('overlay')
    const context = canvas.getContext('2d')

    if (context === null) {
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.strokeStyle = '#22c55e'
    context.lineWidth = Math.max(4, canvas.width / 160)
    context.beginPath()
    code.corners.forEach(({ x, y }, index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)))
    context.closePath()
    context.stroke()

    clearTimeout(this.clearOverlay)
    this.clearOverlay = setTimeout(() => context.clearRect(0, 0, canvas.width, canvas.height), 1500)
  }

  private async showFacts(): Promise<void> {
    const { scanner } = this.butler
    const native = scanner.isSupported && !this.hasNoDetector() ? await scanner.formats() : []
    const session = this.session

    this.element<HTMLVideoElement>('preview').hidden = session === undefined
    this.element<HTMLButtonElement>('stop').disabled = session === undefined
    this.element<HTMLButtonElement>('torch').disabled = session?.torch === undefined

    this.describe('facts', {
      'Code detector of the browser': this.hasNoDetector() ? 'none' : native.join(', ') || 'reads nothing here',
      'Reads with': this.hasNoDetector() ? 'zxing-wasm' : 'the code detector of the browser',
      Camera: session?.descriptor.label ?? 'off',
      Scan: this.scan?.state ?? 'none',
    })
  }

  protected override refresh(): void {
    void this.showFacts()
  }
}

Reflect.set(globalThis, 'demo', new CodeScanner(document))
