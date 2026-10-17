import type { CodeFormat } from './code-format.ts'

/**
 * A point in the pixels of the picture a code was found in, from its top left corner.
 */
export interface CodePoint {
  readonly x: number
  readonly y: number
}

/**
 * A code that was read.
 */
export interface DetectedCode {
  readonly format: CodeFormat
  /** what the code says, as text */
  readonly value: string
  /**
   * The corners of the code, clockwise from its top left, in the pixels of the whole picture: also where only a
   * region of it was looked at. An overlay that shows the picture scaled draws them scaled the same.
   */
  readonly corners: readonly CodePoint[]
}

/**
 * The code with its corners moved by the offset: from the pixels of a region to those of the whole picture.
 */
export const shiftCode = ({ format, value, corners }: DetectedCode, offset: CodePoint): DetectedCode => ({
  format,
  value,
  corners: corners.map(({ x, y }) => ({ x: x + offset.x, y: y + offset.y })),
})
