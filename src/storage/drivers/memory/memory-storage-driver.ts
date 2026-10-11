import { StorageCapabilities } from '../../storage-capabilities.ts'
import { StorageDriver } from '../storage-driver.ts'

/**
 * Keeps everything in a map that lives as long as the driver. Used in tests, during server-side rendering and as the
 * last entry of a fallback chain.
 */
export class MemoryStorageDriver extends StorageDriver {
  private static readonly encoder = new TextEncoder()

  /** the name a store is opened with: `{ driver: 'memory' }` */
  public readonly name: string = 'memory'
  /** gone when the page is left, holds bytes as they are, can stream */
  public readonly capabilities = new StorageCapabilities({
    driver: this.name,
    persistence: 'page',
    binary: true,
    streaming: true,
  })

  private readonly namespaces = new Map<string, Map<string, string | Uint8Array>>()

  /**
   * Always, memory needs nothing from the browser.
   */
  public isSupported(): Promise<boolean> {
    return Promise.resolve(true)
  }

  /**
   * A copy of what was written, so changing it does not change the entry.
   */
  public async read(namespace: string, key: string): Promise<string | Uint8Array | undefined> {
    const value = this.namespaces.get(namespace)?.get(key)

    // a copy, so changes the caller makes to what it read do not reach into the store
    return typeof value === 'string' ? value : value?.slice()
  }

  public override async peek(namespace: string, key: string, length: number): Promise<string | Uint8Array | undefined> {
    return this.namespaces.get(namespace)?.get(key)?.slice(0, length)
  }

  /**
   * Keeps a copy of the value, so later changes to the buffer of the caller do not reach the entry.
   */
  public async write(namespace: string, key: string, value: string | Uint8Array): Promise<void> {
    // a copy, so later changes to the buffer of the caller do not reach into the store
    this.entriesOf(namespace).set(key, typeof value === 'string' ? value : value.slice())
  }

  /**
   * @returns whether there was an entry
   */
  public async remove(namespace: string, key: string): Promise<boolean> {
    return this.namespaces.get(namespace)?.delete(key) ?? false
  }

  /**
   * The keys of the namespace, in the order they were first written.
   */
  public async *list(namespace: string): AsyncIterable<string> {
    yield* [...(this.namespaces.get(namespace)?.keys() ?? [])]
  }

  /**
   * Two bytes per character of keys and strings, and the length of byte values.
   */
  public async measure(namespace: string): Promise<number> {
    let bytes = 0

    for (const [key, value] of this.namespaces.get(namespace) ?? []) {
      bytes += key.length * 2 + (typeof value === 'string' ? value.length * 2 : value.byteLength)
    }

    return bytes
  }

  public override async openReadStream(
    namespace: string,
    key: string
  ): Promise<ReadableStream<Uint8Array> | undefined> {
    const value = await this.read(namespace, key)

    if (value === undefined) {
      return undefined
    }

    const bytes = typeof value === 'string' ? MemoryStorageDriver.encoder.encode(value) : value

    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(bytes)
        controller.close()
      },
    })
  }

  public override async openWriteStream(namespace: string, key: string): Promise<WritableStream<Uint8Array>> {
    const chunks: Uint8Array[] = []

    return new WritableStream<Uint8Array>({
      write: (chunk) => {
        chunks.push(chunk.slice())
      },
      // the entry is only replaced once everything was written
      close: () => {
        const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0))
        let offset = 0

        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }

        this.entriesOf(namespace).set(key, bytes)
      },
    })
  }

  private entriesOf(namespace: string): Map<string, string | Uint8Array> {
    let entries = this.namespaces.get(namespace)

    if (entries === undefined) {
      entries = new Map()
      this.namespaces.set(namespace, entries)
    }

    return entries
  }
}
