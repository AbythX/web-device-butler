/**
 * Bytes as text, for backends that only hold strings.
 */
export class Base64 {
  // String.fromCharCode takes its characters as arguments, whose number is limited
  private static readonly chunkSize = 0x8000

  /**
   * The bytes as base64.
   */
  public static encode(bytes: Uint8Array): string {
    let binary = ''

    for (let offset = 0; offset < bytes.length; offset += Base64.chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + Base64.chunkSize))
    }

    return btoa(binary)
  }

  /**
   * The bytes a base64 text stands for.
   *
   * @throws DOMException if the text is not base64
   */
  public static decode(text: string): Uint8Array {
    const binary = atob(text)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }

    return bytes
  }
}
