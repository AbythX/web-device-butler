/// <reference types="vite/client" />
import readerUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import writerUrl from 'zxing-wasm/writer/zxing_writer.wasm?url'
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer'
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { DefaultCodeScanner } from '../../media/scanning/default-code-scanner.ts'
import type { CodeScanner } from '../../media/scanning/code-scanner.ts'
import type { CodeScanSource, CodeScanSourceEvents } from '../../media/scanning/scan/code-scan.ts'
import type { MediaSessionState } from '../../media/session/media-session.ts'
import { ZxingCodeDecoder } from './zxing-code-decoder.ts'

/**
 * These specs run in real browsers: codes are written with the writer of zxing-wasm and read back, from a file, from
 * a canvas and from the stream of a canvas, which is what a camera delivers.
 */
const pictureOf = async (text: string, format: string): Promise<Blob> => {
  const { image, error } = await writeBarcode(text, { format: format as never, scale: 6 })

  if (image === null) {
    throw new Error(`Could not write a ${format}: ${error}`)
  }

  return image
}

/**
 * Whether the stream of a canvas delivers pictures. The WebKit build of Playwright has no `captureStream` on Windows,
 * and on Linux one whose stream never shows a picture.
 */
const canvasStreamsPictures = async (): Promise<boolean> => {
  if (!('captureStream' in HTMLCanvasElement.prototype)) {
    return false
  }

  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const stream = canvas.captureStream(10)
  const redraw = setInterval(() => canvas.getContext('2d')?.fillRect(0, 0, 1, 1), 50)
  const video = document.createElement('video')
  video.muted = true
  video.srcObject = stream

  try {
    await Promise.race([video.play(), new Promise((resolve) => setTimeout(resolve, 2000))])
    const showing = Date.now()

    while (video.videoWidth === 0 && Date.now() - showing < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    return video.videoWidth > 0
  } catch {
    return false
  } finally {
    clearInterval(redraw)
    stream.getTracks().forEach((track) => track.stop())
  }
}

const hasCanvasStream = await canvasStreamsPictures()

/** a session that delivers what a canvas shows */
class CanvasSource extends EventEmitter<CodeScanSourceEvents> implements CodeScanSource {
  public readonly state: MediaSessionState = 'live'

  public constructor(public readonly stream: MediaStream) {
    super()
  }
}

describe('reading codes with zxing-wasm in a real browser', () => {
  let sut!: CodeScanner
  const canvases: HTMLCanvasElement[] = []

  /** a canvas of 800 by 400 pixels, with the code on its right half */
  const canvasWith = async (picture: Blob): Promise<HTMLCanvasElement> => {
    const bitmap = await createImageBitmap(picture)
    const canvas = Object.assign(document.createElement('canvas'), { width: 800, height: 400 })
    const context = canvas.getContext('2d') as CanvasRenderingContext2D
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 450, 50, 300, 300)
    canvases.push(canvas)

    return canvas
  }

  beforeAll(() => {
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? writerUrl : prefix + path) },
    })
  })

  beforeEach(() => {
    sut = DefaultCodeScanner.create(
      { decoder: new ZxingCodeDecoder({ wasmUrl: readerUrl }) },
      BrowserEnvironment.browser(),
      new NullLogger()
    )
  })

  afterEach(() => {
    sut.dispose()
    canvases.splice(0).forEach((canvas) => canvas.remove())
  })

  test('should be supported in every browser', async () => {
    expect(sut.isSupported).toBe(true)
    expect(await sut.formats()).toContain('qr_code')
  })

  test.each([
    ['QRCode', 'qr_code', 'https://example.com/scan'],
    ['DataMatrix', 'data_matrix', 'LOT-4711'],
    ['EAN13', 'ean_13', '4006381333931'],
    ['Code128', 'code_128', 'PARCEL-0815'],
  ])('should read a %s from a file the user chose', async (format, expected, text) => {
    const [code, ...more] = await sut.detect(await pictureOf(text, format))

    expect(more).toEqual([])
    expect(code?.format).toBe(expected)
    expect(code?.value).toBe(text)
    expect(code?.corners).toHaveLength(4)
  })

  test('should look only for the formats it is asked for', async () => {
    const picture = await pictureOf('https://example.com', 'QRCode')

    expect(await sut.detect(picture, { formats: ['ean_13'] })).toEqual([])
    expect(await sut.detect(picture, { formats: ['qr_code'] })).toHaveLength(1)
  })

  test('should read a region of a canvas, and give the corners in the pixels of the whole canvas', async () => {
    const canvas = await canvasWith(await pictureOf('right half', 'QRCode'))

    const [code] = await sut.detect(canvas, { region: { x: 0.5, y: 0, width: 0.5, height: 1 } })
    const outside = await sut.detect(canvas, { region: { x: 0, y: 0, width: 0.5, height: 1 } })

    expect(code?.value).toBe('right half')
    expect(Math.min(...(code?.corners ?? []).map(({ x }) => x))).toBeGreaterThan(440)
    expect(outside).toEqual([])
  })

  test.skipIf(!hasCanvasStream)(
    'should find a code in the stream of a canvas, as in the stream of a camera',
    async () => {
      const canvas = await canvasWith(await pictureOf('from the stream', 'QRCode'))
      const stream = canvas.captureStream(10)
      // a canvas stream delivers a picture when the canvas is drawn on
      const redraw = setInterval(() => canvas.getContext('2d')?.fillRect(0, 0, 1, 1), 50)

      try {
        await using scan = sut.scan(new CanvasSource(stream), { formats: ['qr_code'] })
        const code = await scan.next()

        expect(code.value).toBe('from the stream')
      } finally {
        clearInterval(redraw)
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  )
})

describe.skipIf(!('BarcodeDetector' in globalThis))('reading codes with the code detector of the browser', () => {
  test('should read what the browser says it can read', async () => {
    const sut = DefaultCodeScanner.create()
    const formats = await sut.formats()

    expect(sut.isSupported).toBe(true)
    expect(Array.isArray(formats)).toBe(true)
  })
})
