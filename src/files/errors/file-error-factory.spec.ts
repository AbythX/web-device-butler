import { describe, expect, test } from 'vitest'

import { FileError } from './file-error.ts'
import { FileErrorFactory } from './file-error-factory.ts'

const browserError = (name: string) => Object.assign(new Error(`${name} of the browser`), { name })

describe('file-error-factory', () => {
  describe('#from', () => {
    test('should turn a failure into a file error with the action', async () => {
      const cause = browserError('NoModificationAllowedError')

      const error = FileErrorFactory.from(cause, "Could not write the file 'report.pdf'")

      expect(error).toBeInstanceOf(FileError)
      expect(error).toMatchObject({ message: "Could not write the file 'report.pdf'", cause })
    })

    test('should return an error of the library as it is', async () => {
      const error = new FileError('already translated')

      expect(FileErrorFactory.from(error, "Could not write the file 'report.pdf'")).toBe(error)
    })
  })

  describe('#isCancellation', () => {
    test('should recognize a save dialog the user closed', async () => {
      expect(FileErrorFactory.isCancellation(browserError('AbortError'))).toBe(true)
      expect(FileErrorFactory.isCancellation(browserError('SecurityError'))).toBe(false)
    })
  })
})
