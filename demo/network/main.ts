import {
  DefaultDeviceButler,
  type DeviceButler,
  type Outbox,
  type OutboxEntry,
  type OutboxSendContext,
} from '../../src/index.ts'
import { DemoPage } from '../shared/demo-page.ts'

/**
 * What this page sends.
 */
interface Item {
  text: string
}

/**
 * The demo page of the network: what the browser says about the connection, and an outbox that keeps items until
 * they could be sent.
 */
class NetworkDemo extends DemoPage {
  /** how long the server of this page takes to answer, in milliseconds */
  private static readonly answerTime = 400

  private readonly butler: DeviceButler
  private outbox: Outbox<Item> | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger, storage: { namespace: 'web-device-butler-demo' } })

    this.butler.network.on('change', (isOnline) => {
      this.logger.info(`network change: ${isOnline ? 'online' : 'offline'}`)
      this.showFacts()
      // the outbox starts sending by itself when the network returns; the table follows a moment later
      void this.showWaiting()
    })
    this.butler.network.on('connectionchange', (connection) => {
      this.logger.info('network connectionchange', connection)
      this.showFacts()
    })

    this.onClick('open', () => this.open())
    this.onClick('dispose', () => {
      this.outbox?.dispose()
      this.outbox = undefined
    })
    this.onClick('add', async () => {
      const text = String(new FormData(this.element<HTMLFormElement>('item')).get('text'))
      const { id } = await this.opened.add({ text })

      this.status(`add(): kept as ${id}`)
    })
    this.onClick('flush', () => this.opened.flush())
    this.onClick('entries', () => this.showWaiting())

    this.showFacts()
  }

  private get opened(): Outbox<Item> {
    if (this.outbox === undefined) {
      throw new Error('Open the outbox first')
    }

    return this.outbox
  }

  private async open(): Promise<void> {
    this.outbox?.dispose()

    const form = new FormData(this.element<HTMLFormElement>('options'))

    const optional = (name: string): number | undefined => {
      const value = String(form.get(name))

      return value === '' ? undefined : Number(value)
    }

    const outbox = await this.butler.outbox.open<Item>({
      namespace: 'demo-items',
      send: (item, context) => this.send(item, context),
      maxAttempts: optional('maxAttempts'),
      retryDelay: optional('retryDelay'),
    })

    outbox.on('sent', (entry) => {
      this.logger.info(`sent: ${entry.id}`)
      void this.showWaiting()
    })
    outbox.on('failed', ({ entry, error, willRetry }) => {
      this.logger.warn(`failed: ${entry.id}, ${willRetry ? 'will be tried again' : 'given up'}`, error)
      void this.showWaiting()
    })

    this.outbox = outbox
    await this.showWaiting()
  }

  /**
   * Stands for the request to a server: it takes a moment, and fails while the server does not answer.
   */
  private async send(item: Item, { id, attempt, signal }: OutboxSendContext): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, NetworkDemo.answerTime))
    signal.throwIfAborted()

    if (!this.element<HTMLInputElement>('answers').checked) {
      throw new Error('The server did not answer')
    }

    this.element('sent').prepend(this.row(new Date().toLocaleTimeString(), id, item.text, String(attempt)))
  }

  // ---- output ----

  private showFacts(): void {
    const { network } = this.butler
    const { type, effectiveType, downlink, roundTripTime, saveData } = network.connection ?? {}
    this.describe('facts', {
      Online: network.isOnline === undefined ? 'unknown' : String(network.isOnline),
      'Connected through': NetworkDemo.said(type),
      'Lately as fast as': NetworkDemo.said(effectiveType),
      Downlink: NetworkDemo.said(downlink, ' Mbit/s'),
      'Round trip': NetworkDemo.said(roundTripTime, ' ms'),
      'Save data': NetworkDemo.said(saveData),
    })

    this.element('outbox-facts').textContent =
      this.outbox === undefined ? 'not open' : this.outbox.isSending ? 'sending' : 'not sending'
  }

  /**
   * What the browser reported, or that it did not.
   */
  private static said(value: string | number | boolean | undefined, unit = ''): string {
    return value === undefined ? 'not reported' : `${value}${unit}`
  }

  private async showWaiting(): Promise<void> {
    const outbox = this.outbox
    const entries = (await outbox?.entries()) ?? []

    const rows = entries.map((entry: OutboxEntry<Item>) =>
      this.row(
        entry.id,
        entry.item.text,
        new Date(entry.addedAt).toLocaleTimeString(),
        String(entry.attempts),
        entry.lastError ?? '',
        this.button('remove()', () => outbox?.remove(entry.id))
      )
    )

    this.element('waiting').replaceChildren(...rows)
    this.showFacts()
  }

  protected override refresh(): void {
    void this.showWaiting()
  }
}

Reflect.set(globalThis, 'demo', new NetworkDemo(document))
