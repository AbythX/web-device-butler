import { DefaultDeviceButler, type DeviceButler, type FilePickOptions } from '../../src/index.ts'
import { DemoPage } from '../shared/demo-page.ts'

/**
 * The demo page of what leaves the page and what comes into it: the share sheet, the clipboard and the files of the
 * device.
 */
class SharingDemo extends DemoPage {
  private readonly butler: DeviceButler

  /** what is shared, copied and saved as a picture: drawn by the page until the user picks one */
  private picture: File | undefined
  /** the object URL of the picture on the page, which the browser keeps until it is revoked */
  private shown: string | undefined
  /** ends a `pick()` whose dialog the browser does not report as closed */
  private picking: AbortController | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger })

    const { share, clipboard, files } = this.butler

    this.onClick('share-text', async () => this.shared(await share.share({ title: 'A text', text: this.text })))
    this.onClick('share-url', async () => this.shared(await share.share({ title: 'A link', url: location.href })))
    this.onClick('share-picture', async () => this.shared(await share.share({ files: [this.pictureOrFail] })))

    this.onClick('copy-text', () => clipboard.writeText(this.text))
    this.onClick('paste-text', async () => this.status(`readText(): '${await clipboard.readText()}'`))
    this.onClick('copy-picture', () => clipboard.write(this.pictureOrFail))

    this.onClick('save', async () => {
      const picture = this.pictureOrFail

      this.status(`save(): ${await files.save(picture, { name: picture.name, description: 'Picture' })}`)
    })
    this.onClick('pick', () => this.pick())
    this.onClick('abort', () => this.picking?.abort(new Error('The page stopped waiting')))

    void this.run('Drawing the picture', async () => this.show(await this.draw()))
  }

  private get text(): string {
    return String(new FormData(this.element<HTMLFormElement>('content')).get('text'))
  }

  private get pictureOrFail(): File {
    if (this.picture === undefined) {
      throw new Error('There is no picture yet')
    }

    return this.picture
  }

  private get pickOptions(): FilePickOptions {
    const form = new FormData(this.element<HTMLFormElement>('pick-options'))
    const accept = String(form.get('accept')).trim()

    return {
      accept: accept === '' ? undefined : accept.split(/\s*,\s*/),
      multiple: form.has('multiple'),
      // SAFETY: the select of the form only offers the sides of the type, and '' for none
      capture: (form.get('capture') || undefined) as FilePickOptions['capture'],
    }
  }

  private shared(wasShared: boolean): void {
    this.status(wasShared ? 'share(): shared' : 'share(): the user closed the sheet')
  }

  private async pick(): Promise<void> {
    this.picking?.abort(new Error('Another pick() was started'))

    const picking = new AbortController()
    this.picking = picking

    const files = await this.butler.files.pick({ ...this.pickOptions, signal: picking.signal })

    const rows = files.map((file) =>
      this.row(
        file.name,
        file.type || 'unknown',
        DemoPage.bytes(file.size),
        new Date(file.lastModified).toLocaleString()
      )
    )

    this.element('picked').replaceChildren(...rows)
    this.status(`pick(): ${files.length === 0 ? 'the user closed the dialog' : `${files.length} files`}`)

    const picture = files.find((file) => file.type.startsWith('image/'))

    if (picture !== undefined) {
      this.show(picture)
    }
  }

  /**
   * A PNG, which is the kind of picture every browser that copies data copies.
   */
  private async draw(): Promise<File> {
    const canvas = Object.assign(this.page.createElement('canvas'), { width: 320, height: 200 })
    const context = canvas.getContext('2d')

    if (context === null) {
      throw new Error('This browser draws no pictures')
    }

    context.fillStyle = '#1f3a5f'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#fff'
    context.font = '24px system-ui, sans-serif'
    context.textAlign = 'center'
    context.fillText('web-device-butler', canvas.width / 2, 90)
    context.fillText(new Date().toLocaleTimeString(), canvas.width / 2, 130)

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))

    if (png === null) {
      throw new Error('This browser writes no PNG')
    }

    return new File([png], 'picture.png', { type: 'image/png' })
  }

  // ---- output ----

  private show(picture: File): void {
    if (this.shown !== undefined) {
      URL.revokeObjectURL(this.shown)
    }

    this.picture = picture
    this.shown = URL.createObjectURL(picture)
    this.element<HTMLImageElement>('picture').src = this.shown
    this.element('picture-facts').textContent = `${picture.name}, ${picture.type}, ${DemoPage.bytes(picture.size)}`
  }

  private showFacts(): void {
    const { share, clipboard, files, platform } = this.butler
    const picture = this.picture

    this.describe('facts', {
      'User agent': navigator.userAgent,
      Platform: platform.isIos ? 'iOS' : platform.isAndroid ? 'Android' : 'other',
      'Secure context': String(globalThis.isSecureContext),
      'Share sheet': String(share.isSupported),
      'Shares a text': String(share.canShare({ text: this.text })),
      'Shares the picture': picture === undefined ? 'no picture yet' : String(share.canShare({ files: [picture] })),
      Clipboard: String(clipboard.isSupported),
      'Copies the picture': picture === undefined ? 'no picture yet' : String(clipboard.canWrite(picture.type)),
      'Save dialog': files.canChooseWhereToSave ? 'the user chooses the place' : 'a download',
    })
  }

  protected override refresh(): void {
    this.showFacts()
  }
}

Reflect.set(globalThis, 'demo', new SharingDemo(document))
