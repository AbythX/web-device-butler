/**
 * An origin private file system in memory, for specs. It models what the driver relies on: a file that is created
 * empty, a writable that replaces the file when it is closed, and the errors for missing entries.
 */
export class FakeFileSystemDirectory {
  public readonly kind = 'directory'

  private readonly entries = new Map<string, FakeFileSystemDirectory | FakeFileSystemFile>()

  public constructor(public readonly name = '') {}

  public async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<FakeFileSystemDirectory> {
    const entry = this.entries.get(name) ?? this.create(name, options.create, () => new FakeFileSystemDirectory(name))

    if (!(entry instanceof FakeFileSystemDirectory)) {
      throw new DOMException('The entry is not a directory.', 'TypeMismatchError')
    }

    return entry
  }

  public async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FakeFileSystemFile> {
    const entry = this.entries.get(name) ?? this.create(name, options.create, () => new FakeFileSystemFile(name))

    if (!(entry instanceof FakeFileSystemFile)) {
      throw new DOMException('The entry is not a file.', 'TypeMismatchError')
    }

    return entry
  }

  public async removeEntry(name: string): Promise<void> {
    if (!this.entries.delete(name)) {
      throw new DOMException('The entry does not exist.', 'NotFoundError')
    }
  }

  public async *keys(): AsyncIterable<string> {
    yield* [...this.entries.keys()]
  }

  public async *values(): AsyncIterable<FakeFileSystemDirectory | FakeFileSystemFile> {
    yield* [...this.entries.values()]
  }

  /**
   * For specs: puts a file into the directory the way the browser or another program would.
   */
  public add(file: FakeFileSystemFile): void {
    this.entries.set(file.name, file)
  }

  private create<Entry extends FakeFileSystemDirectory | FakeFileSystemFile>(
    name: string,
    create: boolean | undefined,
    construct: () => Entry
  ): Entry {
    if (!create) {
      throw new DOMException('The entry does not exist.', 'NotFoundError')
    }

    if (name === '' || name === '.' || name === '..' || name.includes('/')) {
      throw new TypeError('The name is not allowed.')
    }

    const entry = construct()
    this.entries.set(name, entry)

    return entry
  }
}

export class FakeFileSystemFile {
  public readonly kind = 'file'

  private content: Uint8Array = new Uint8Array(0)

  public constructor(public readonly name: string) {}

  public async getFile(): Promise<File> {
    return new File([this.content.slice() as Uint8Array<ArrayBuffer>], this.name)
  }

  public async createWritable(): Promise<FakeFileSystemWritable> {
    return new FakeFileSystemWritable((content) => {
      this.content = content
    })
  }
}

export class FakeFileSystemWritable {
  private static readonly encoder = new TextEncoder()

  private chunks: Uint8Array[] | undefined = []

  public constructor(private readonly commit: (content: Uint8Array) => void) {}

  public async write(data: string | Uint8Array): Promise<void> {
    this.open().push(typeof data === 'string' ? FakeFileSystemWritable.encoder.encode(data) : data.slice())
  }

  public async close(): Promise<void> {
    const chunks = this.open()
    this.chunks = undefined

    const content = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0))
    let offset = 0

    for (const chunk of chunks) {
      content.set(chunk, offset)
      offset += chunk.byteLength
    }

    this.commit(content)
  }

  public async abort(): Promise<void> {
    this.chunks = undefined
  }

  private open(): Uint8Array[] {
    if (this.chunks === undefined) {
      throw new TypeError('The writable is closed.')
    }

    return this.chunks
  }
}
