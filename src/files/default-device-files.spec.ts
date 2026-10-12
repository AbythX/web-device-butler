import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { UnsupportedError } from '../core/errors/unsupported-error.ts'
import type { Logger } from '../core/logging/logger.ts'
import { FakeEventTarget } from '../core/testing/fake-event-target.ts'
import { DefaultDeviceFiles } from './default-device-files.ts'
import { FileError } from './errors/file-error.ts'

const errorNamed = (name: string) => Object.assign(new Error(name), { name })

/** an element the page creates: a link to download through, or an input to choose files with */
class FakeElement extends FakeEventTarget {
  public readonly style: Record<string, string> = {}
  public readonly attributes: Record<string, string> = {}
  public href = ''
  public download = ''
  public rel = ''
  public type = ''
  public accept = ''
  public multiple = false
  public files: object[] | null = null
  public clicks = 0
  public isAttached = false

  public constructor(
    public readonly tagName: string,
    private readonly page: FakeDocument
  ) {
    super()
  }

  public setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  public click(): void {
    this.clicks++
    this.page.clicked.push({ element: this, wasAttached: this.isAttached })
  }

  public remove(): void {
    this.isAttached = false
  }
}

class FakeDocument {
  public readonly created: FakeElement[] = []
  public readonly clicked: { element: FakeElement; wasAttached: boolean }[] = []

  public readonly body = {
    append: (element: FakeElement) => {
      element.isAttached = true
    },
  }

  public readonly createElement = (tagName: string): FakeElement => {
    const element = new FakeElement(tagName, this)
    this.created.push(element)

    return element
  }

  public get last(): FakeElement {
    const last = this.created.at(-1)

    if (last === undefined) {
      throw new Error('The page created no element')
    }

    return last
  }
}

/** a file the user chose in the save dialog */
class FakeFileHandle {
  public readonly written: Blob[] = []
  public isClosed = false
  public failure: unknown

  public async createWritable(): Promise<object> {
    return {
      write: async (data: Blob) => {
        if (this.failure !== undefined) {
          throw this.failure
        }

        this.written.push(data)
      },
      close: async () => {
        this.isClosed = true
      },
    }
  }
}

describe('default-device-files', () => {
  let page!: FakeDocument
  let handle!: FakeFileHandle
  let showSaveFilePicker!: ReturnType<typeof vi.fn<(options?: object) => Promise<FakeFileHandle>>>
  let urls!: { createObjectURL: (data: Blob) => string; revokeObjectURL: (url: string) => void }
  let logger!: Logger

  const photo = new Blob(['picture'], { type: 'image/jpeg' })

  const filesOf = (globals: object) => new DefaultDeviceFiles(BrowserEnvironment.of(globals), logger)
  const withDialog = () => filesOf({ window: { showSaveFilePicker }, document: page, URL: urls })
  const withoutDialog = () => filesOf({ window: {}, document: page, URL: urls })

  beforeEach(() => {
    vi.useFakeTimers()
    page = new FakeDocument()
    handle = new FakeFileHandle()
    showSaveFilePicker = vi.fn(async () => handle)
    urls = { createObjectURL: vi.fn(() => 'blob:photo'), revokeObjectURL: vi.fn() }
    logger = mock<Logger>()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('#create', () => {
    test('should work without arguments and outside a browser', async () => {
      expect(DefaultDeviceFiles.create().canChooseWhereToSave).toBe(false)
    })
  })

  describe('#save', () => {
    test('should let the user choose where the file goes and write it there', async () => {
      const sut = withDialog()

      expect(sut.canChooseWhereToSave).toBe(true)
      expect(await sut.save(photo, { name: 'scan.jpg', description: 'Photo' })).toBe('saved')

      expect(showSaveFilePicker).toHaveBeenCalledExactlyOnceWith({
        suggestedName: 'scan.jpg',
        types: [{ description: 'Photo', accept: { 'image/jpeg': ['.jpg'] } }],
      })
      expect(handle.written).toEqual([photo])
      expect(handle.isClosed).toBe(true)
      expect(page.created).toHaveLength(0)
    })

    test('should offer the kind of the file without the parameters of its type', async () => {
      const recording = new Blob(['video'], { type: 'video/webm;codecs=vp9' })

      await withDialog().save(recording, { name: 'message.webm' })

      expect(showSaveFilePicker).toHaveBeenCalledExactlyOnceWith({
        suggestedName: 'message.webm',
        types: [{ description: undefined, accept: { 'video/webm': ['.webm'] } }],
      })
    })

    test.each([
      ['a name without an extension', photo, 'scan'],
      ['data without a type', new Blob(['data']), 'scan.bin'],
    ])('should only suggest the name for %s', async (_name, data, name) => {
      await withDialog().save(data, { name })

      expect(showSaveFilePicker).toHaveBeenCalledExactlyOnceWith({ suggestedName: name })
    })

    test('should say when the user closed the dialog without choosing', async () => {
      showSaveFilePicker.mockRejectedValue(errorNamed('AbortError'))

      expect(await withDialog().save(photo, { name: 'scan.jpg' })).toBe('cancelled')
      expect(page.created).toHaveLength(0)
    })

    test('should hand the file over as a download where the browser has no save dialog', async () => {
      const sut = withoutDialog()

      expect(sut.canChooseWhereToSave).toBe(false)
      expect(await sut.save(photo, { name: 'scan.jpg' })).toBe('downloaded')

      const link = page.last
      expect(link.tagName).toBe('a')
      expect(link.href).toBe('blob:photo')
      expect(link.download).toBe('scan.jpg')
      expect(page.clicked).toEqual([{ element: link, wasAttached: true }])
      expect(link.isAttached).toBe(false)
    })

    test('should hand the file over as a download when the dialog cannot be shown', async () => {
      showSaveFilePicker.mockRejectedValue(errorNamed('SecurityError'))

      expect(await withDialog().save(photo, { name: 'scan.jpg' })).toBe('downloaded')
      expect(page.last.download).toBe('scan.jpg')
      expect(logger.debug).toHaveBeenCalledOnce()
    })

    test('should give the address of a download back once the browser had its time', async () => {
      await withoutDialog().save(photo, { name: 'scan.jpg' })
      expect(urls.revokeObjectURL).not.toHaveBeenCalled()

      vi.advanceTimersByTime(60_000)

      expect(urls.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:photo')
    })

    test('should report a file that could not be written', async () => {
      handle.failure = new Error('disk full')

      const failure = await withDialog()
        .save(photo, { name: 'scan.jpg' })
        .catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(FileError)
      expect(failure).toHaveProperty('cause', handle.failure)
    })

    test('should say where there is no page', async () => {
      await expect(filesOf({}).save(photo, { name: 'scan.jpg' })).rejects.toThrow(UnsupportedError)
    })

    test('should not use the save dialog on a page that is not secure', async () => {
      const sut = filesOf({ window: { showSaveFilePicker }, document: page, URL: urls, isSecureContext: false })

      expect(sut.canChooseWhereToSave).toBe(false)
      expect(await sut.save(photo, { name: 'scan.jpg' })).toBe('downloaded')
    })
  })

  describe('#pick', () => {
    test('should return the files the user chose', async () => {
      const picked = withoutDialog().pick()
      const input = page.last
      const chosen = [{ name: 'a.jpg' }]

      input.files = chosen
      input.dispatch('change')

      expect(await picked).toEqual(chosen)
      expect(input.tagName).toBe('input')
      expect(input.type).toBe('file')
      expect(page.clicked).toEqual([{ element: input, wasAttached: true }])
      expect(input.isAttached).toBe(false)
    })

    test('should offer what the application asks for', async () => {
      void withoutDialog().pick({ accept: ['image/*', '.pdf'], multiple: true, capture: 'environment' })
      const input = page.last

      expect(input.accept).toBe('image/*,.pdf')
      expect(input.multiple).toBe(true)
      expect(input.attributes).toEqual({ capture: 'environment' })

      input.dispatch('cancel')
    })

    test('should offer every file, one of them, unless it is told otherwise', async () => {
      void withoutDialog().pick({ accept: 'image/*' })
      const input = page.last

      expect(input.accept).toBe('image/*')
      expect(input.multiple).toBe(false)
      expect(input.attributes).toEqual({})

      input.dispatch('cancel')
    })

    test('should return nothing if the user closed the dialog', async () => {
      const picked = withoutDialog().pick()

      page.last.dispatch('cancel')

      expect(await picked).toEqual([])
      expect(page.last.isAttached).toBe(false)
    })

    test('should stop waiting when its signal aborts', async () => {
      const controller = new AbortController()
      const reason = new Error('left the screen')
      const picked = withoutDialog().pick({ signal: controller.signal })

      controller.abort(reason)

      await expect(picked).rejects.toBe(reason)
      expect(page.last.isAttached).toBe(false)
    })

    test('should not show the dialog for a signal that has aborted', async () => {
      const reason = new Error('too late')

      await expect(withoutDialog().pick({ signal: AbortSignal.abort(reason) })).rejects.toBe(reason)
      expect(page.created).toHaveLength(0)
    })

    test('should say where there is no page', async () => {
      await expect(filesOf({}).pick()).rejects.toThrow(UnsupportedError)
    })
  })
})
