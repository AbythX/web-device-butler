/**
 * A number of the file format in its variable length: an id or a size.
 */
interface WebmNumber {
  /** how many bytes it takes */
  readonly length: number
  readonly value: number
  /** a size that says "until the end", as a recorder writes it for what it has not finished */
  readonly isUnknown: boolean
}

/**
 * One element of the file: where it begins, where its content begins and where it ends.
 */
interface WebmElement {
  readonly id: number
  readonly start: number
  readonly sizeStart: number
  readonly size: WebmNumber
  readonly contentStart: number
  /** `undefined` for an element whose size is not known */
  readonly end: number | undefined
}

/**
 * What replaces the beginning of a file.
 */
export interface WebmPatch {
  /** the new beginning of the file */
  readonly head: Uint8Array<ArrayBuffer>
  /** how many bytes of the old file it stands for */
  readonly replaced: number
}

/**
 * Writes the length of a recording into a WebM file.
 *
 * A recorder writes the file from front to back and does not know the length when it writes the head, so it leaves
 * it out. A player that is given such a file shows no length and cannot jump to a position. The length belongs into
 * the `Info` element near the beginning. Some recorders leave it out, others keep a place for it and leave that at
 * zero; this class adds it or fills it in, and leaves the rest of the file as it is.
 */
export class WebmDuration {
  /** the head of a file is a few hundred bytes; this much is read to find it */
  private static readonly headLength = 64 * 1024

  private static readonly ebml = 0x1a45dfa3
  private static readonly segment = 0x18538067
  private static readonly seekHead = 0x114d9b74
  private static readonly info = 0x1549a966
  private static readonly cluster = 0x1f43b675
  private static readonly timestampScale = 0x2ad7b1
  private static readonly duration = 0x4489
  /** a millisecond in nanoseconds, the scale a file has unless it says otherwise */
  private static readonly defaultScale = 1_000_000

  /**
   * The same recording with its length written into it.
   *
   * @param duration how long the recording is, in milliseconds
   * @param createBlob puts the parts of the new file together
   * @returns the blob it was given if that is not a WebM file, has its length already, or is built in a way this
   *   class does not change
   */
  public static async apply(
    recording: Blob,
    duration: number,
    createBlob: (parts: BlobPart[], type: string) => Blob
  ): Promise<Blob> {
    const head = new Uint8Array(await recording.slice(0, WebmDuration.headLength).arrayBuffer())
    const patched = WebmDuration.patch(head, duration)

    return patched === undefined
      ? recording
      : createBlob([patched.head, recording.slice(patched.replaced)], recording.type)
  }

  /**
   * @param head the beginning of the file
   * @returns the bytes that replace the first `replaced` bytes of the file; `undefined` if nothing is to change
   */
  public static patch(head: Uint8Array, duration: number): WebmPatch | undefined {
    const header = WebmDuration.read(head, 0)

    if (header === undefined || header.id !== WebmDuration.ebml || header.end === undefined) {
      return undefined
    }

    const segment = WebmDuration.read(head, header.end)

    if (segment === undefined || segment.id !== WebmDuration.segment) {
      return undefined
    }

    const info = WebmDuration.findInfo(head, segment)

    if (info === undefined || info.end === undefined) {
      return undefined
    }

    const content = head.subarray(info.contentStart, info.end)
    const fields = WebmDuration.fieldsOf(content)

    if (fields === undefined) {
      return undefined
    }

    const length = (duration * WebmDuration.defaultScale) / fields.scale

    return fields.duration === undefined
      ? WebmDuration.add(head, segment, info, length)
      : WebmDuration.fill(head, info, fields.duration, length)
  }

  /**
   * For a file whose recorder left the length out: the info gets the length as a new field at its end.
   */
  private static add(head: Uint8Array, segment: WebmElement, info: WebmElement, length: number): WebmPatch {
    const end = info.end ?? head.length
    const content = head.subarray(info.contentStart, end)
    // the id of the length, its size of eight bytes, and the length itself
    const added = Uint8Array.of(0x44, 0x89, 0x88, ...WebmDuration.float(length, 8))
    const infoHead = head.subarray(info.start, info.sizeStart)
    const infoSize = WebmDuration.encodeSize(content.length + added.length, info.size.length)
    const grownBy = infoSize.length - info.size.length + added.length

    const before = head.slice(0, info.start)
    WebmDuration.growSegment(before, segment, grownBy)

    return { head: WebmDuration.join([before, infoHead, infoSize, content, added]), replaced: end }
  }

  /**
   * For a file whose recorder kept a place for the length and left it at zero: the length is written there, and
   * nothing in the file moves.
   *
   * @param field where the length is, within the content of the info
   * @returns `undefined` if the file says how long it is already
   */
  private static fill(head: Uint8Array, info: WebmElement, field: WebmElement, length: number): WebmPatch | undefined {
    const end = info.end ?? head.length
    const start = info.contentStart + field.contentStart
    const size = field.size.value

    if ((size !== 4 && size !== 8) || WebmDuration.readFloat(head.subarray(start, start + size)) > 0) {
      return undefined
    }

    const filled = head.slice(0, end)
    filled.set(WebmDuration.float(length, size), start)

    return { head: filled, replaced: end }
  }

  /**
   * The `Info` element of the file, if it comes before the first recorded data and nothing points past it.
   */
  private static findInfo(head: Uint8Array, segment: WebmElement): WebmElement | undefined {
    let position = segment.contentStart

    for (;;) {
      const element = WebmDuration.read(head, position)

      if (element === undefined || element.end === undefined || element.id === WebmDuration.cluster) {
        return undefined
      }

      // An index of positions would point at the wrong places if the file grew. Recorders write none, or an empty
      // one.
      if (element.id === WebmDuration.seekHead && element.size.value > 0) {
        return undefined
      }

      if (element.id === WebmDuration.info) {
        return element
      }

      position = element.end
    }
  }

  /**
   * What the `Info` element says about time.
   *
   * @returns `undefined` if its content cannot be read
   */
  private static fieldsOf(content: Uint8Array): { scale: number; duration: WebmElement | undefined } | undefined {
    let scale = WebmDuration.defaultScale
    let duration: WebmElement | undefined
    let position = 0

    while (position < content.length) {
      const field = WebmDuration.read(content, position)

      if (field === undefined || field.end === undefined) {
        return undefined
      }

      if (field.id === WebmDuration.duration) {
        duration = field
      } else if (field.id === WebmDuration.timestampScale) {
        scale = content.subarray(field.contentStart, field.end).reduce((value, byte) => value * 256 + byte, 0)
      }

      position = field.end
    }

    return scale > 0 ? { scale, duration } : undefined
  }

  /**
   * A segment that says how long it is has grown. One that does not fit its new size into the bytes it has says
   * "until the end" instead, which is what recorders write anyway.
   *
   * @param before the bytes of the file up to the `Info` element, which hold the size of the segment
   */
  private static growSegment(before: Uint8Array, segment: WebmElement, grownBy: number): void {
    if (segment.size.isUnknown) {
      return
    }

    const { length } = segment.size
    const size = segment.size.value + grownBy
    const fits = size < 2 ** (7 * length) - 1

    before.set(fits ? WebmDuration.encodeSize(size, length) : WebmDuration.unknownSize(length), segment.sizeStart)
  }

  /**
   * @returns `undefined` if there is no complete element at the position
   */
  private static read(bytes: Uint8Array, start: number): WebmElement | undefined {
    const id = WebmDuration.readNumber(bytes, start, true)

    if (id === undefined) {
      return undefined
    }

    const sizeStart = start + id.length
    const size = WebmDuration.readNumber(bytes, sizeStart, false)

    if (size === undefined) {
      return undefined
    }

    const contentStart = sizeStart + size.length
    const end = contentStart + size.value

    if (size.isUnknown) {
      return { id: id.value, start, sizeStart, size, contentStart, end: undefined }
    }

    // an element that is not completely among the bytes cannot be read
    return end <= bytes.length ? { id: id.value, start, sizeStart, size, contentStart, end } : undefined
  }

  /**
   * The first byte says how long the number is: by the position of its first bit that is set. An id keeps that
   * bit, a size does not.
   */
  private static readNumber(bytes: Uint8Array, start: number, isId: boolean): WebmNumber | undefined {
    const first = bytes[start]

    if (first === undefined || first === 0) {
      return undefined
    }

    const length = Math.clz32(first) - 23

    if (start + length > bytes.length) {
      return undefined
    }

    let value = isId ? first : first & (0xff >> length)

    for (const byte of bytes.subarray(start + 1, start + length)) {
      value = value * 256 + byte
    }

    return { length, value, isUnknown: !isId && value === 2 ** (7 * length) - 1 }
  }

  /**
   * @param length how many bytes the size takes at least
   */
  private static encodeSize(size: number, length: number): Uint8Array {
    let bytes = length

    while (size >= 2 ** (7 * bytes) - 1) {
      bytes++
    }

    const encoded = new Uint8Array(bytes)
    let rest = size

    for (let index = bytes - 1; index >= 0; index--) {
      encoded[index] = rest % 256
      rest = Math.floor(rest / 256)
    }

    encoded[0] = (encoded[0] ?? 0) | (0x80 >> (bytes - 1))

    return encoded
  }

  private static unknownSize(length: number): Uint8Array {
    const encoded = new Uint8Array(length).fill(0xff)
    encoded[0] = 0xff >> (length - 1)

    return encoded
  }

  /**
   * @param size four or eight bytes
   */
  private static float(value: number, size: number): Uint8Array {
    const bytes = new Uint8Array(size)
    const view = new DataView(bytes.buffer)

    if (size === 4) {
      view.setFloat32(0, value)
    } else {
      view.setFloat64(0, value)
    }

    return bytes
  }

  private static readFloat(bytes: Uint8Array): number {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    return bytes.length === 4 ? view.getFloat32(0) : view.getFloat64(0)
  }

  private static join(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
    const joined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
    let position = 0

    for (const part of parts) {
      joined.set(part, position)
      position += part.length
    }

    return joined
  }
}
