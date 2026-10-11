import { StorageCodecError } from '../errors/storage-codec-error.ts'
import { StorageVersionError } from '../errors/storage-version-error.ts'
import { Base64 } from './base64.ts'

interface EnvelopeHeader {
  /** format version */
  v: number
  /** whether the codec produced a string or bytes */
  t: 's' | 'b'
  /** expiry as milliseconds since the epoch */
  e?: number
}

/**
 * What the store keeps next to every value: the format version and the expiry. An entry is one header line of JSON,
 * a line feed, and the encoded value. That works as a string and as bytes, and lets the head of a large entry be read
 * without the value.
 */
export class StorageEnvelope {
  /** the version of the format, written into every header */
  public static readonly version = 1
  /** an upper bound for the header line, used to read only the head of an entry */
  public static readonly maxHeaderLength = 96

  private static readonly lineFeed = 10
  private static readonly encoder = new TextEncoder()
  private static readonly decoder = new TextDecoder()

  /**
   * @param binary whether the backend holds bytes as they are; otherwise bytes are written as base64
   */
  public static seal(
    payload: string | Uint8Array,
    expiresAt: number | undefined,
    binary: boolean
  ): string | Uint8Array {
    if (typeof payload === 'string') {
      return StorageEnvelope.headerLine('s', expiresAt) + payload
    }

    if (!binary) {
      return StorageEnvelope.headerLine('b', expiresAt) + Base64.encode(payload)
    }

    const header = StorageEnvelope.headerBytes(expiresAt)
    const sealed = new Uint8Array(header.byteLength + payload.byteLength)
    sealed.set(header)
    sealed.set(payload, header.byteLength)

    return sealed
  }

  /**
   * The header line of an entry whose bytes follow as a stream.
   */
  public static headerBytes(expiresAt: number | undefined): Uint8Array {
    return StorageEnvelope.encoder.encode(StorageEnvelope.headerLine('b', expiresAt))
  }

  /**
   * @param raw the entry, or at least its first {@link maxHeaderLength} characters or bytes
   * @throws StorageCodecError if the entry was not written by this library
   * @throws StorageVersionError if it was written in a newer format
   */
  public static open(key: string, raw: string | Uint8Array): StorageEnvelope {
    const end =
      typeof raw === 'string'
        ? raw.slice(0, StorageEnvelope.maxHeaderLength).indexOf('\n')
        : raw.subarray(0, StorageEnvelope.maxHeaderLength).indexOf(StorageEnvelope.lineFeed)

    if (end < 0) {
      throw StorageEnvelope.foreign(key)
    }

    const line = typeof raw === 'string' ? raw.slice(0, end) : StorageEnvelope.decoder.decode(raw.subarray(0, end))
    const header = StorageEnvelope.parse(key, line)

    if (header.v > StorageEnvelope.version) {
      throw new StorageVersionError(key, header.v, StorageEnvelope.version)
    }

    return new StorageEnvelope(header, raw, end + 1)
  }

  private static parse(key: string, line: string): EnvelopeHeader {
    let header: unknown

    try {
      header = JSON.parse(line)
    } catch (error) {
      throw StorageEnvelope.foreign(key, error)
    }

    if (
      typeof header !== 'object' ||
      header === null ||
      !('v' in header) ||
      typeof header.v !== 'number' ||
      !('t' in header) ||
      (header.t !== 's' && header.t !== 'b') ||
      ('e' in header && typeof header.e !== 'number')
    ) {
      throw StorageEnvelope.foreign(key)
    }

    // SAFETY: version, type and expiry of the header were each checked above
    return header as EnvelopeHeader
  }

  private static headerLine(type: EnvelopeHeader['t'], expiresAt: number | undefined): string {
    const header: EnvelopeHeader = { v: StorageEnvelope.version, t: type, e: expiresAt }

    return `${JSON.stringify(header)}\n`
  }

  private static foreign(key: string, cause?: unknown): StorageCodecError {
    return new StorageCodecError(`The entry '${key}' was not written by this library`, { cause })
  }

  private constructor(
    private readonly header: EnvelopeHeader,
    private readonly raw: string | Uint8Array,
    /** where the value starts, in characters or bytes */
    public readonly payloadOffset: number
  ) {}

  /**
   * When the entry expires, in milliseconds since the epoch; `undefined` if it never does.
   */
  public get expiresAt(): number | undefined {
    return this.header.e
  }

  /**
   * @param now in milliseconds since the epoch
   */
  public isExpired(now: number): boolean {
    return this.header.e !== undefined && this.header.e <= now
  }

  /**
   * What the codec produced when the entry was written. Only valid if the envelope was opened with the whole entry.
   */
  public get payload(): string | Uint8Array {
    if (typeof this.raw === 'string') {
      const text = this.raw.slice(this.payloadOffset)

      return this.header.t === 's' ? text : Base64.decode(text)
    }

    const bytes = this.raw.subarray(this.payloadOffset)

    return this.header.t === 's' ? StorageEnvelope.decoder.decode(bytes) : bytes
  }
}
