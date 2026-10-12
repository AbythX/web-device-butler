import { beforeEach, describe, expect, test, vi } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { SharingError } from '../errors/sharing-error.ts'
import { DefaultDeviceClipboard } from './default-device-clipboard.ts'

const errorNamed = (name: string) => Object.assign(new Error(name), { name })

/** what a browser wraps copied data in */
class FakeClipboardItem {
  public static supports: ((type: string) => boolean) | undefined = (type) => type === 'image/png'

  public constructor(public readonly items: Record<string, Blob>) {}
}

class FakeClipboard {
  public text = ''
  public readonly written: FakeClipboardItem[] = []
  /** makes the next calls fail */
  public failure: unknown

  public readonly writeText = vi.fn(async (text: string) => {
    this.fail()
    this.text = text
  })

  public readonly readText = vi.fn(async () => {
    this.fail()

    return this.text
  })

  public readonly write = vi.fn(async (items: FakeClipboardItem[]) => {
    this.fail()
    this.written.push(...items)
  })

  private fail(): void {
    if (this.failure !== undefined) {
      throw this.failure
    }
  }
}

describe('default-device-clipboard', () => {
  let clipboard!: FakeClipboard
  let sut!: DefaultDeviceClipboard

  const clipboardOf = (globals: object) => new DefaultDeviceClipboard(BrowserEnvironment.of(globals))
  const picture = { type: 'image/png' } as Blob

  beforeEach(() => {
    FakeClipboardItem.supports = (type) => type === 'image/png'
    clipboard = new FakeClipboard()
    sut = clipboardOf({ navigator: { clipboard }, ClipboardItem: FakeClipboardItem })
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      expect(DefaultDeviceClipboard.create().isSupported).toBe(false)
    })
  })

  describe('#isSupported', () => {
    test('should be true where pages have a clipboard', async () => {
      expect(sut.isSupported).toBe(true)
    })

    test.each([
      ['there is no browser', {}],
      ['the browser gives pages no clipboard', { navigator: {} }],
      ['the page is not secure', { navigator: { clipboard: new FakeClipboard() }, isSecureContext: false }],
    ])('should be false where %s', async (_name, globals) => {
      const unsupported = clipboardOf(globals)

      expect(unsupported.isSupported).toBe(false)
      expect(unsupported.canWrite('image/png')).toBe(false)
      await expect(unsupported.writeText('Hello')).rejects.toThrow(UnsupportedError)
      await expect(unsupported.readText()).rejects.toThrow(UnsupportedError)
      await expect(unsupported.write(picture)).rejects.toThrow(UnsupportedError)
    })
  })

  describe('#writeText', () => {
    test('should copy the text', async () => {
      await sut.writeText('Hello')

      expect(clipboard.text).toBe('Hello')
    })

    test('should report a refusal of the browser', async () => {
      clipboard.failure = errorNamed('NotAllowedError')

      const failure = await sut.writeText('Hello').catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(PermissionDeniedError)
      expect(failure).toHaveProperty('permission', 'clipboard')
      expect(failure).toHaveProperty('cause', clipboard.failure)
    })

    test('should report any other failure as an error of sharing', async () => {
      clipboard.failure = errorNamed('DataError')

      await expect(sut.writeText('Hello')).rejects.toThrow(SharingError)
    })
  })

  describe('#readText', () => {
    test('should return the text the user copied', async () => {
      clipboard.text = 'Copied'

      expect(await sut.readText()).toBe('Copied')
    })

    test('should say where the browser does not let pages read', async () => {
      const writeOnly = clipboardOf({ navigator: { clipboard: { writeText: async () => undefined } } })

      await expect(writeOnly.readText()).rejects.toThrow(UnsupportedError)
    })

    test('should report a refusal of the user', async () => {
      clipboard.failure = errorNamed('NotAllowedError')

      await expect(sut.readText()).rejects.toThrow(PermissionDeniedError)
    })
  })

  describe('#canWrite', () => {
    test('should ask the browser', async () => {
      expect(sut.canWrite('image/png')).toBe(true)
      expect(sut.canWrite('image/jpeg')).toBe(false)
    })

    test('should assume what every browser copies where the browser cannot be asked', async () => {
      FakeClipboardItem.supports = undefined

      expect(sut.canWrite('image/png')).toBe(true)
      expect(sut.canWrite('text/plain')).toBe(true)
      expect(sut.canWrite('image/jpeg')).toBe(false)
    })

    test('should be false where the browser only copies text', async () => {
      const textOnly = clipboardOf({ navigator: { clipboard: { writeText: async () => undefined } } })

      expect(textOnly.canWrite('image/png')).toBe(false)
    })
  })

  describe('#write', () => {
    test('should copy the data by its type', async () => {
      await sut.write(picture)

      expect(clipboard.written).toHaveLength(1)
      expect(clipboard.written[0]?.items).toEqual({ 'image/png': picture })
    })

    test('should refuse a type the browser cannot copy', async () => {
      await expect(sut.write({ type: 'image/jpeg' } as Blob)).rejects.toThrow(UnsupportedError)
      expect(clipboard.write).not.toHaveBeenCalled()
    })

    test('should report a refusal of the browser', async () => {
      clipboard.failure = errorNamed('NotAllowedError')

      await expect(sut.write(picture)).rejects.toThrow(PermissionDeniedError)
    })
  })
})
