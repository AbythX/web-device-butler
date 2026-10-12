import {
  BinaryCodec,
  DefaultDeviceButler,
  type DeviceButler,
  type Outbox,
  type OutboxEntry,
  type OutboxSendContext,
  type Store,
} from '../../../src/index.ts'
import { DemoPage } from '../../shared/demo-page.ts'

/**
 * What waits in the outbox: everything about a report except its photo, which is too large for it.
 */
interface Report {
  /** the entry of the store that holds the photo */
  photo: string
  /** the name and the type the photo came with */
  name: string
  type: string
  note: string
  takenAt: number
}

/**
 * What the server keeps of a report.
 */
interface Received {
  note: string
  bytes: number
  receivedAt: number
}

/**
 * The use case of a report from a place without a network: a photo of the camera application and a note, kept
 * until they could be sent.
 */
class FieldReport extends DemoPage {
  /** the entry the note is kept in while it is written */
  private static readonly draft = 'note'

  private readonly butler: DeviceButler
  /** the photos of the reports that wait, as bytes */
  private readonly photos: Promise<Store<Uint8Array>>
  private readonly drafts: Promise<Store<string>>
  /** stands for the server */
  private readonly server: Promise<Store<Received>>
  private readonly reports: Promise<Outbox<Report>>

  /** the photo of the report that is being written */
  private photo: File | undefined
  /** the object URL of that photo on the page, which the browser keeps until it is revoked */
  private shown: string | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger, storage: { namespace: 'web-device-butler-demo' } })

    const { storage, outbox, network } = this.butler

    this.photos = storage.open({
      driver: ['opfs', 'indexeddb', 'memory'],
      namespace: 'report-photos',
      codec: new BinaryCodec(),
    })
    this.drafts = storage.open<string>({ driver: ['indexeddb', 'local', 'memory'], namespace: 'report-draft' })
    this.server = storage.open<Received>({ driver: ['indexeddb', 'local', 'memory'], namespace: 'report-server' })
    // opening it starts sending what the last visit left
    this.reports = outbox.open<Report>({
      namespace: 'reports',
      send: (report, context) => this.send(report, context),
    })

    network.on('change', () => {
      this.showNetwork()
      // the outbox starts by itself when the network returns
      void this.showWaiting()
    })
    // a phone throws a page in the background away without another word: this is the moment to keep the note
    this.butler.page.on('change', (state) => {
      if (state !== 'visible') {
        void this.keepDraft()
      }
    })

    this.onClick('take', () => this.pick('environment'))
    this.onClick('choose', () => this.pick(undefined))
    this.onClick('queue', () => this.queue())
    this.onClick('flush', async () => (await this.reports).flush())
    this.onClick('clear', async () => (await this.server).clear())

    void this.run('Loading the reports', async () => {
      const reports = await this.reports

      reports.on('sent', (entry) => void this.run('A report was sent', () => this.forget(entry)))
      reports.on('failed', ({ error }) => {
        this.logger.warn('A report was not sent', error)
        void this.showWaiting()
      })
      ;(await this.server).on('change', () => void this.showReceived())

      this.note.value = (await (await this.drafts).get(FieldReport.draft)) ?? ''
      this.showNetwork()
      await this.showReceived()
    })
  }

  private get note(): HTMLTextAreaElement {
    return this.element<HTMLTextAreaElement>('note')
  }

  /**
   * Takes a photo with the camera application of the system, or lets the user choose one.
   */
  private async pick(capture: 'environment' | undefined): Promise<void> {
    const [photo] = await this.butler.files.pick({ accept: 'image/*', capture })

    // nothing: the user closed the dialog, and the photo from before stays
    if (photo !== undefined) {
      this.showPhoto(photo)
    }
  }

  /**
   * Keeps the report and hands it to the outbox, which sends it now or later.
   */
  private async queue(): Promise<void> {
    const photo = this.photo

    if (photo === undefined) {
      throw new Error('A report needs a photo')
    }

    // the photo first, so a report in the outbox always has one
    const key = crypto.randomUUID()
    await (await this.photos).set(key, new Uint8Array(await photo.arrayBuffer()))
    await (
      await this.reports
    ).add({
      photo: key,
      name: photo.name,
      type: photo.type,
      note: this.note.value,
      takenAt: photo.lastModified,
    })

    this.note.value = ''
    this.showPhoto(undefined)
    await this.keepDraft()
    this.status(this.butler.network.isOnline === false ? 'Kept. It is sent once there is a network.' : 'Kept.')
  }

  /**
   * What the outbox calls for every report. Rejecting keeps the report for a later try.
   */
  private async send(report: Report, { id, signal }: OutboxSendContext): Promise<void> {
    const photo = await this.photoOf(report)
    signal.throwIfAborted()

    if (!this.element<HTMLInputElement>('answers').checked) {
      throw new Error('The server did not answer')
    }

    // under the id of the report: a second delivery replaces the first
    await (await this.server).set(id, { note: report.note, bytes: photo.size, receivedAt: Date.now() })
  }

  /**
   * Removes the photo of a report that left the outbox.
   */
  private async forget({ item }: OutboxEntry<Report>): Promise<void> {
    await (await this.photos).delete(item.photo)
    await this.showWaiting()
  }

  private async keepDraft(): Promise<void> {
    await (await this.drafts).set(FieldReport.draft, this.note.value)
  }

  private async photoOf(report: Report): Promise<File> {
    const bytes = await (await this.photos).get(report.photo)

    if (bytes === undefined) {
      throw new Error('The photo of this report is gone')
    }

    // SAFETY: the store never returns shared memory, which is all the type of File rules out
    return new File([bytes as Uint8Array<ArrayBuffer>], report.name, { type: report.type })
  }

  // ---- output ----

  private showPhoto(photo: File | undefined): void {
    if (this.shown !== undefined) {
      URL.revokeObjectURL(this.shown)
    }

    this.photo = photo
    this.shown = photo === undefined ? undefined : URL.createObjectURL(photo)

    const image = this.element<HTMLImageElement>('photo')
    image.hidden = this.shown === undefined
    image.src = this.shown ?? ''
  }

  private showNetwork(): void {
    this.element('network').textContent =
      this.butler.network.isOnline === false ? 'no network: reports are kept and sent later' : 'online'
  }

  private async showWaiting(): Promise<void> {
    const reports = await this.reports
    const entries = await reports.entries()
    const { share, files } = this.butler

    const rows = entries.map((entry) => {
      const { item } = entry

      const shareButton = this.button('Share', async () => {
        await share.share({ text: item.note, files: [await this.photoOf(item)] })
      })

      // not every browser has a share sheet
      shareButton.hidden = !share.isSupported

      return this.row(
        new Date(item.takenAt).toLocaleString(),
        item.note,
        String(entry.attempts),
        entry.lastError ?? '',
        shareButton,
        this.button('Save the photo', async () => {
          this.status(`The photo was ${await files.save(await this.photoOf(item), { name: item.name })}`)
        }),
        this.button('Discard', async () => {
          if (await reports.remove(entry.id)) {
            await this.forget(entry)
          }
        })
      )
    })

    this.element('waiting').replaceChildren(...rows)
    this.element('waiting-facts').textContent = `${entries.length}${reports.isSending ? ', sending' : ''}`
  }

  private async showReceived(): Promise<void> {
    const received: Received[] = []

    for await (const [, report] of (await this.server).entries()) {
      received.push(report)
    }

    received.sort((first, second) => second.receivedAt - first.receivedAt)

    const rows = received.map((report) =>
      this.row(new Date(report.receivedAt).toLocaleString(), report.note, DemoPage.bytes(report.bytes))
    )

    this.element('received').replaceChildren(...rows)
  }

  protected override refresh(): void {
    void this.showWaiting()
  }
}

Reflect.set(globalThis, 'demo', new FieldReport(document))
