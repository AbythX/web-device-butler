import {
  BinaryCodec,
  DefaultDeviceButler,
  type DeviceButler,
  type EventSubscription,
  type StorageSpace,
  type StorageSpaceWatch,
  type Store,
} from '../../src/index.ts'
import { DemoPage } from '../shared/demo-page.ts'

/**
 * The demo page of the storage: every call of a store behind a button, and what several tabs do to each other.
 */
class StorageDemo extends DemoPage {
  private static readonly drivers = ['local', 'session', 'opfs', 'indexeddb', 'memory']
  private static readonly counterKey = 'counter'
  private static readonly streamKey = 'large'
  private static readonly megabyte = 1024 * 1024

  private readonly butler: DeviceButler

  private store: Store | undefined
  /** the same driver with a codec for bytes, for the streams */
  private files: Store<Uint8Array> | undefined
  private changes: EventSubscription | undefined
  private spaceWatch: StorageSpaceWatch | undefined

  public constructor(page: Document) {
    super(page)
    this.butler = DefaultDeviceButler.create({ logger: this.logger, storage: { namespace: 'web-device-butler-demo' } })

    this.onClick('open', () => this.open())
    this.onClick('set', () => this.opened.set(this.key, this.value, { ttl: this.ttl }))
    this.onClick('get', async () => this.status(`get(): ${JSON.stringify(await this.opened.get(this.key))}`))
    this.onClick('has', async () => this.status(`has(): ${await this.opened.has(this.key)}`))
    this.onClick('delete', async () => this.status(`delete(): ${await this.opened.delete(this.key)}`))
    this.onClick('set-no-wait', () => this.opened.set(this.key, this.value, { ttl: this.ttl, wait: false }))
    this.onClick('lock', () => this.holdLock())
    this.onClick('entries', () => this.showEntries())
    this.onClick('clear', () => this.opened.clear())

    this.onClick('count-update', () => this.countWithUpdate())
    this.onClick('count-get-set', () => this.countWithGetAndSet())
    this.onClick('count-reset', () => this.opened.delete(StorageDemo.counterKey))

    this.onClick('write-stream', () => this.writeStream())
    this.onClick('read-stream', () => this.readStream())
    this.onClick('delete-stream', () => this.openedFiles.delete(StorageDemo.streamKey))

    this.onClick('space', async () => this.showSpace(await this.butler.storage.space()))
    this.onClick('persist', async () => this.status(`persist(): ${await this.butler.storage.persist()}`))
    this.element('watch-space').addEventListener('change', () => this.watchSpace())

    void this.showFacts()
  }

  private get opened(): Store {
    if (this.store === undefined) {
      throw new Error('Open a store first')
    }

    return this.store
  }

  private get openedFiles(): Store<Uint8Array> {
    if (this.files === undefined) {
      throw new Error('Open a store first')
    }

    return this.files
  }

  private get entryForm(): FormData {
    return new FormData(this.element<HTMLFormElement>('entry-form'))
  }

  private get key(): string {
    return String(this.entryForm.get('key'))
  }

  private get value(): unknown {
    return JSON.parse(String(this.entryForm.get('value')))
  }

  private get ttl(): number | undefined {
    const ttl = String(this.entryForm.get('ttl'))

    return ttl === '' ? undefined : Number(ttl)
  }

  private async open(): Promise<void> {
    const form = new FormData(this.element<HTMLFormElement>('store-form'))

    const driver = String(form.get('driver'))
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0)

    const namespace = String(form.get('namespace'))

    const store = await this.butler.storage.open({ driver, namespace })
    // the entries of the streams are bytes and no JSON, so they live in a namespace of their own
    this.files = await this.butler.storage.open({
      driver: store.capabilities.driver,
      namespace: `${namespace}-files`,
      codec: new BinaryCodec(),
    })

    this.changes?.unsubscribe()
    this.changes = store.on('change', ({ type, key, origin }) => {
      const row = this.row(new Date().toLocaleTimeString(), origin, type, key)
      row.classList.toggle('remote', origin === 'remote')
      this.element('changes').prepend(row)

      if (key === StorageDemo.counterKey) {
        void this.showCounter()
      }
    })
    this.store = store

    const { capabilities } = store
    this.describe('capabilities', {
      Driver: capabilities.driver,
      Persistence: capabilities.persistence,
      Binary: String(capabilities.binary),
      Streaming: String(capabilities.streaming),
      'Events from other tabs': String(capabilities.crossTabEvents),
      'Consistent across tabs': String(capabilities.consistentAcrossTabs),
    })
    await this.showEntries()
    await this.showCounter()
  }

  /**
   * Keeps the entry for itself for a while, so the other buttons and the other tabs can be seen waiting.
   */
  private holdLock(): Promise<void> {
    return this.opened.lock(this.key, async (entry) => {
      this.status(`lock(): holding '${entry.key}'`)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    })
  }

  private async countWithUpdate(): Promise<void> {
    // SAFETY: only the entry of the counter is touched, which this page writes as a number unless the user stores
    // something else under its key by hand
    const store = this.opened as Store<number>

    for (let step = 0; step < 100; step++) {
      await store.update(StorageDemo.counterKey, (count = 0) => count + 1)
    }
  }

  /**
   * The way that loses steps: between the read and the write another tab can write.
   */
  private async countWithGetAndSet(): Promise<void> {
    // SAFETY: only the entry of the counter is touched, which this page writes as a number unless the user stores
    // something else under its key by hand
    const store = this.opened as Store<number>

    for (let step = 0; step < 100; step++) {
      const count = (await store.get(StorageDemo.counterKey)) ?? 0
      await store.set(StorageDemo.counterKey, count + 1)
    }
  }

  private async writeStream(): Promise<void> {
    const megabytes = Number(new FormData(this.element<HTMLFormElement>('stream-form')).get('megabytes'))
    const chunk = new Uint8Array(StorageDemo.megabyte).fill(42)

    const writer = (await this.openedFiles.writeStream(StorageDemo.streamKey)).getWriter()

    try {
      for (let written = 0; written < megabytes; written++) {
        await writer.write(chunk)
      }

      // only now the entry is replaced
      await writer.close()
    } catch (error) {
      // the entry stays as it was, and its lock is released
      await writer.abort(error).catch(() => undefined)
      throw error
    }

    this.status(`writeStream(): wrote ${megabytes} MB`)
  }

  private async readStream(): Promise<void> {
    const stream = await this.openedFiles.readStream(StorageDemo.streamKey)

    if (stream === undefined) {
      this.status('readStream(): there is no entry')

      return
    }

    // read with a reader: Safari cannot iterate a stream with `for await`
    const reader = stream.getReader()
    let bytes = 0

    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      bytes += chunk.value.byteLength
    }

    this.status(`readStream(): read ${DemoPage.bytes(bytes)}`)
  }

  private watchSpace(): void {
    this.spaceWatch?.dispose()
    this.spaceWatch = undefined

    if (this.element<HTMLInputElement>('watch-space').checked) {
      this.spaceWatch = this.butler.storage.watchSpace({ interval: 2000, lowBelow: 100 * StorageDemo.megabyte })
      this.spaceWatch.on('change', (space) => this.showSpace(space))
      this.spaceWatch.on('low', (space) => this.logger.warn(`low: ${DemoPage.bytes(space.available)} left`))
    }
  }

  // ---- output ----

  private async showFacts(): Promise<void> {
    const support = await Promise.all(
      StorageDemo.drivers.map(async (driver) => [driver, String(await this.butler.storage.isSupported(driver))])
    )

    this.describe('facts', {
      ...Object.fromEntries(support),
      'Cross-tab locks': String(this.butler.coordination.isCrossTab),
    })
  }

  private async showEntries(): Promise<void> {
    const rows: HTMLTableRowElement[] = []

    for await (const [key, value] of this.opened.entries()) {
      rows.push(this.row(key, JSON.stringify(value)))
    }

    this.element('entry-rows').replaceChildren(...rows)
    this.element('size').textContent = DemoPage.bytes(await this.opened.size())
  }

  private async showCounter(): Promise<void> {
    this.describe('counter', { Counter: String((await this.opened.get(StorageDemo.counterKey)) ?? 0) })
  }

  private showSpace(space: StorageSpace): void {
    this.describe('space-facts', {
      Known: String(space.isKnown),
      Quota: DemoPage.bytes(space.quota),
      Usage: DemoPage.bytes(space.usage),
      Available: DemoPage.bytes(space.available),
      Used: space.usedRatio === undefined ? 'unknown' : `${(space.usedRatio * 100).toFixed(2)} %`,
      Persistent: String(space.isPersistent),
    })
  }
}

Reflect.set(globalThis, 'demo', new StorageDemo(document))
