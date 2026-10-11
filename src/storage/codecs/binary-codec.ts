import type { Codec } from './codec.ts'

/**
 * Stores bytes. Backends that can only hold strings receive them base64 encoded, which the store takes care of.
 */
export class BinaryCodec implements Codec<Uint8Array> {
  private static readonly encoder = new TextEncoder()

  /**
   * The bytes as they are.
   *
   * @throws TypeError if the value is not a `Uint8Array`
   */
  public encode(value: Uint8Array): Uint8Array {
    if (!(value instanceof Uint8Array)) {
      throw new TypeError('The value is not a Uint8Array')
    }

    return value
  }

  /**
   * @returns bytes with a buffer of their own. What a backend holds is the value behind a header, and a view on
   *   that would hand the header to everything that works with `value.buffer`. Values that are too large to be
   *   copied belong in a stream.
   */
  public decode(raw: string | Uint8Array): Uint8Array {
    if (typeof raw === 'string') {
      return BinaryCodec.encoder.encode(raw)
    }

    return raw.byteOffset === 0 && raw.byteLength === raw.buffer.byteLength ? raw : raw.slice()
  }
}
