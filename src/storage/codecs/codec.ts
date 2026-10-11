/**
 * Turns the values of a store into what a backend can hold, and back. An application adds its own format by
 * implementing this interface.
 */
export interface Codec<T> {
  /**
   * What the backend stores, as text or as bytes. Throwing makes the write fail with a `StorageCodecError`.
   */
  encode(value: T): string | Uint8Array
  /**
   * The value that was encoded. A backend that only holds bytes hands a string back as its UTF-8 bytes, so both
   * forms have to be accepted.
   */
  decode(raw: string | Uint8Array): T
}
