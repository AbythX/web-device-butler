import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultDeviceButler } from '../core/default-device-butler.ts'
import type { DeviceButler } from '../core/device-butler.ts'
import { DeviceButlerError } from '../core/errors/device-butler-error.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import { inAnswerToAClick } from '../core/testing/in-answer-to-a-click.ts'
import { DefaultDeviceClipboard } from './clipboard/default-device-clipboard.ts'
import { DefaultDeviceShare } from './share/default-device-share.ts'

/**
 * These specs run in real browsers. A share sheet cannot be answered by a spec, and which browser copies what
 * differs, so the specs ask for what holds everywhere: what the library says a browser can do is what it then does,
 * and what a browser refuses arrives as an error of the library.
 */
const hasShareSheet = DefaultDeviceShare.create().isSupported

const hasClipboard = DefaultDeviceClipboard.create().isSupported

describe('sharing in a real browser', () => {
  let butler!: DeviceButler

  beforeEach(async () => {
    await commands.showFirstTab()
    butler = DefaultDeviceButler.create()
  })

  afterEach(async () => {
    await butler.dispose()
  })

  describe('the share sheet', () => {
    const link = { title: 'A page', url: 'https://example.com/' }

    test('should not offer to share nothing', async () => {
      expect(butler.share.canShare({})).toBe(false)
      await expect(butler.share.share({})).rejects.toThrow(UnsupportedError)
    })

    test('should say whether the browser shares a link', async () => {
      expect(butler.share.isSupported).toBe(hasShareSheet)
      expect(butler.share.canShare(link)).toBe(hasShareSheet)
    })

    test.skipIf(hasShareSheet)('should refuse to share where the browser has no share sheet', async () => {
      await expect(butler.share.share(link)).rejects.toThrow(UnsupportedError)
    })

    test('should never claim to share files where it shares nothing', async () => {
      const file = new File(['text'], 'note.txt', { type: 'text/plain' })

      expect(butler.share.canShare({ files: [file] }) && !hasShareSheet).toBe(false)
    })
  })

  describe('the clipboard', () => {
    test.skipIf(hasClipboard)('should say where pages have no clipboard', async () => {
      await expect(butler.clipboard.writeText('copied')).rejects.toThrow(UnsupportedError)
      await expect(butler.clipboard.readText()).rejects.toThrow(UnsupportedError)
    })

    test.skipIf(!hasClipboard)('should copy a text in answer to a click, or report why not', async () => {
      const outcome = await inAnswerToAClick(() => butler.clipboard.writeText('copied by a spec'))

      expect(outcome === undefined || outcome instanceof DeviceButlerError).toBe(true)
    })

    test.skipIf(!hasClipboard)('should read the text it copied where the browser lets a page read', async () => {
      const outcome = await inAnswerToAClick(async () => {
        await butler.clipboard.writeText('read back')

        return butler.clipboard.readText()
      })

      // browsers ask the user before a page may read, which nobody answers here: that is an error of the library
      expect(outcome === 'read back' || outcome instanceof DeviceButlerError).toBe(true)
    })

    test('should copy a picture where it says it can, and refuse where it says it cannot', async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 2
      canvas.height = 2
      const drawn = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      const picture = drawn ?? new Blob([], { type: 'image/png' })

      const outcome = await inAnswerToAClick(() => butler.clipboard.write(picture))

      expect(outcome === undefined || outcome instanceof DeviceButlerError).toBe(true)
      expect(outcome instanceof UnsupportedError).toBe(!butler.clipboard.canWrite('image/png'))
    })

    test('should not claim to copy a type no browser copies', async () => {
      expect(butler.clipboard.canWrite('application/x-not-a-type')).toBe(false)
    })
  })
})
