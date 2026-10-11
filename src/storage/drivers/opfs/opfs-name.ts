import { StorageError } from '../../errors/storage-error.ts'

/**
 * Turns namespaces and keys into names the origin private file system accepts, and back.
 *
 * Lowercase letters, digits, `-` and `_` stay as they are; every other byte of the UTF-8 form is written as `%` and
 * two hex digits. Uppercase letters are escaped as well, because the file system of some browsers does not tell
 * names apart that only differ in case. A leading underscore makes the empty string a valid name.
 *
 * File systems limit the length of a name, so a namespace or key that is too long once it is escaped is refused.
 */
export class OpfsName {
  private static readonly encoder = new TextEncoder()
  private static readonly decoder = new TextDecoder()
  private static readonly format = /^_(?:[a-z0-9_-]|%[0-9a-f]{2})*$/
  /** what file systems take as the name of a file */
  private static readonly maxLength = 255

  /**
   * The name of the file or directory that stands for the text.
   *
   * @throws StorageError if the name is longer than a file system accepts
   */
  public static encode(text: string): string {
    let name = '_'

    for (const byte of OpfsName.encoder.encode(text)) {
      const character = String.fromCharCode(byte)
      name += /[a-z0-9_-]/.test(character) ? character : `%${byte.toString(16).padStart(2, '0')}`
    }

    if (name.length > OpfsName.maxLength) {
      throw new StorageError(
        `'${text.slice(0, 32)}...' is too long for the file system: it takes ${name.length} characters as the name ` +
          `of a file, ${OpfsName.maxLength} are possible. Everything but lowercase letters, digits, '-' and '_' ` +
          'counts three times.'
      )
    }

    return name
  }

  /**
   * @returns `undefined` for a name that was not produced by {@link encode}, such as a temporary file of the browser
   */
  public static decode(name: string): string | undefined {
    if (!OpfsName.format.test(name)) {
      return undefined
    }

    const bytes: number[] = []

    for (let index = 1; index < name.length; index++) {
      if (name[index] === '%') {
        bytes.push(Number.parseInt(name.slice(index + 1, index + 3), 16))
        index += 2
      } else {
        bytes.push(name.charCodeAt(index))
      }
    }

    return OpfsName.decoder.decode(new Uint8Array(bytes))
  }
}
