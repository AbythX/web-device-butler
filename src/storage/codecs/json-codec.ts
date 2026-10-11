import type { Codec } from './codec.ts'

export interface JsonCodecOptions<T> {
  /**
   * Validates what was read, for example `schema.parse` of a validation library. It receives the parsed JSON and
   * returns the value or throws. Without it, the stored value is trusted to be a `T`.
   */
  parse?: (value: unknown) => T
}

/**
 * Stores values as JSON. The default codec of a store.
 */
export class JsonCodec<T = unknown> implements Codec<T> {
  private static readonly decoder = new TextDecoder()

  public constructor(private readonly options: JsonCodecOptions<T> = {}) {}

  /**
   * The value as JSON.
   *
   * @throws TypeError if the value has no JSON representation, such as `undefined` or a function
   */
  public encode(value: T): string {
    // SAFETY: widens the type to what JSON.stringify really returns: undefined for a value without a JSON form
    const json = JSON.stringify(value) as string | undefined

    if (json === undefined) {
      throw new TypeError('The value has no JSON representation')
    }

    return json
  }

  /**
   * Parses the JSON and, where the options have a `parse`, passes the result through it.
   */
  public decode(raw: string | Uint8Array): T {
    const value: unknown = JSON.parse(typeof raw === 'string' ? raw : JsonCodec.decoder.decode(raw))

    // SAFETY: without a parse option the caller vouches for the shape with the type argument, as the options document
    return this.options.parse === undefined ? (value as T) : this.options.parse(value)
  }
}
