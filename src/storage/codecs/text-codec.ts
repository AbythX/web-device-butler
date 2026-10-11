import type { Codec } from './codec.ts'

/**
 * Stores strings as they are.
 */
export class TextCodec implements Codec<string> {
  private static readonly decoder = new TextDecoder()

  /**
   * The string as it is.
   *
   * @throws TypeError if the value is not a string
   */
  public encode(value: string): string {
    if (typeof value !== 'string') {
      throw new TypeError('The value is not a string')
    }

    return value
  }

  /**
   * The string as it was written; bytes are read as UTF-8.
   */
  public decode(raw: string | Uint8Array): string {
    return typeof raw === 'string' ? raw : TextCodec.decoder.decode(raw)
  }
}
