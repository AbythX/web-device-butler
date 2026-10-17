import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment, type BrowserGlobals } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import type { Logger } from '../../core/logging/logger.ts'
import type { PageLifecycle, PageState } from '../../platform/page/page-lifecycle.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { CameraSession } from '../camera/session/camera-session.ts'
import type { CombinedMediaSession } from '../combined/combined-media-session.ts'
import { FakeRecordingSource } from '../recording/testing/fake-recording-source.ts'
import type { ScreenCaptureSession } from '../screen-capture/session/screen-capture-session.ts'
import type { CodeScanner } from './code-scanner.ts'
import type { CodeDecoder } from './decoders/code-decoder.ts'
import { DefaultCodeScanner } from './default-code-scanner.ts'
import type { CodeFormat } from './model/code-format.ts'
import type { DetectedCode } from './model/detected-code.ts'
import type { CodeScanEnd, CodeScanSource, CodeScanState } from './scan/code-scan.ts'
import { FakeBarcodeDetector } from './testing/fake-barcode-detector.ts'
import { FakeFrameGrabber, fakeImageData } from './testing/fake-frame-grabber.ts'

const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await pause(2)
  }
}

const qr = (value: string) => ({ format: 'qr_code', rawValue: value, cornerPoints: [{ x: 1, y: 2 }] })

/** a decoder of the application that finds what it is told, and can be slow or fail */
class TestDecoder implements CodeDecoder {
  public readonly name = 'TestDecoder'
  public codes: DetectedCode[] = []
  public delay = 0
  public failure: unknown
  public running = 0
  public mostAtOnce = 0
  public readonly asked: (readonly CodeFormat[] | undefined)[] = []

  public formats(): Promise<readonly CodeFormat[]> {
    return Promise.resolve(['qr_code', 'data_matrix'])
  }

  public async decode(_image: ImageData, formats?: readonly CodeFormat[]): Promise<DetectedCode[]> {
    this.asked.push(formats)
    this.mostAtOnce = Math.max(this.mostAtOnce, ++this.running)

    try {
      await pause(this.delay)

      if (this.failure !== undefined) {
        throw this.failure
      }

      return this.codes.map((code) => ({ ...code }))
    } finally {
      this.running--
    }
  }
}

describe('default-code-scanner', () => {
  let page!: { state: PageState | undefined }
  let grabber!: FakeFrameGrabber
  let logger!: Logger
  let source!: FakeRecordingSource
  let sut!: CodeScanner

  const scannerOf = (globals: Partial<BrowserGlobals>, configuration = {}) =>
    new DefaultCodeScanner(
      configuration,
      BrowserEnvironment.of(globals),
      page as unknown as PageLifecycle,
      logger,
      () => (grabber = new FakeFrameGrabber())
    )

  beforeEach(() => {
    FakeBarcodeDetector.reset()
    page = { state: 'visible' }
    logger = mock<Logger>()
    source = new FakeRecordingSource()
    sut = scannerOf({ BarcodeDetector: FakeBarcodeDetector })
  })

  afterEach(() => {
    sut.dispose()
  })

  test('should scan every session that delivers a picture', () => {
    // compiles only if the sessions of the library can be scanned
    const sources = (camera: CameraSession, both: CombinedMediaSession, screen: ScreenCaptureSession) =>
      [camera, both, screen] satisfies CodeScanSource[]

    expect(sources).toBeDefined()
  })

  describe('#isSupported', () => {
    test('should be true with the code detector of the browser, or a decoder of the application', () => {
      expect(sut.isSupported).toBe(true)
      expect(scannerOf({}, { decoder: new TestDecoder() }).isSupported).toBe(true)
    })

    test('should be false without either, and refuse to scan', async () => {
      const without = scannerOf({})

      expect(without.isSupported).toBe(false)
      expect(() => without.scan(source)).toThrow(UnsupportedError)
      await expect(without.detect(fakeImageData())).rejects.toThrow(UnsupportedError)
    })
  })

  describe('#formats', () => {
    test('should name what the code detector of the browser reads, of the formats the library knows', async () => {
      expect(await sut.formats()).toEqual(['qr_code', 'ean_13', 'code_128'])
    })

    test('should name what a decoder reads', async () => {
      expect(await sut.formats(new TestDecoder())).toEqual(['qr_code', 'data_matrix'])
    })

    test('should name what the decoder of the configuration reads', async () => {
      expect(await scannerOf({}, { decoder: new TestDecoder() }).formats()).toEqual(['qr_code', 'data_matrix'])
    })
  })

  describe('#scan', () => {
    test('should report a code once while it stays in sight', async () => {
      FakeBarcodeDetector.codes = [qr('https://example.com')]
      const codes: DetectedCode[] = []

      const scan = sut.scan(source, { rate: 1000 })
      scan.on('code', (code) => codes.push(code))
      await waitFor(() => FakeBarcodeDetector.detections >= 5)
      await scan.stop()

      expect(codes).toEqual([{ format: 'qr_code', value: 'https://example.com', corners: [{ x: 1, y: 2 }] }])
    })

    test('should report a code again once it was out of sight', async () => {
      const decoder = new TestDecoder()
      decoder.codes = [{ format: 'qr_code', value: 'again', corners: [] }]
      const codes: DetectedCode[] = []

      const scan = sut.scan(source, { rate: 1000, repeatAfter: 100, decoder })
      scan.on('code', (code) => codes.push(code))
      await waitFor(() => codes.length === 1)

      decoder.codes = []
      await pause(150)
      decoder.codes = [{ format: 'qr_code', value: 'again', corners: [] }]
      await waitFor(() => codes.length === 2)
      await scan.stop()

      expect(codes.map(({ value }) => value)).toEqual(['again', 'again'])
    })

    test('should look at the region and give the corners in the pixels of the whole picture', async () => {
      FakeBarcodeDetector.codes = [qr('in the middle')]
      const region = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 }

      await using scan = sut.scan(source, { rate: 1000, region })
      const code = await scan.next()

      expect(grabber.grabbed[0]?.region).toEqual(region)
      expect(code.corners).toEqual([{ x: 251, y: 502 }])
    })

    test('should ask the code detector only for formats it can read', async () => {
      await using scan = sut.scan(source, { rate: 1000, formats: ['qr_code', 'aztec'] })
      await waitFor(() => FakeBarcodeDetector.detections > 0)
      await scan.stop()

      expect(FakeBarcodeDetector.created).toEqual([['qr_code']])
    })

    test('should not create a detector at all for formats it cannot read', async () => {
      await using scan = sut.scan(source, { rate: 1000, formats: ['aztec'] })
      await waitFor(() => grabber.grabbed.length >= 3)
      await scan.stop()

      expect(FakeBarcodeDetector.created).toEqual([])
    })

    test('should follow a session that continues with a new stream', async () => {
      await using scan = sut.scan(source, { rate: 1000 })
      await waitFor(() => grabber.grabbed.length > 0)

      source.suspend()
      source.deliver()
      await waitFor(() => grabber.grabbed.at(-1)?.stream === source.stream)

      expect(grabber.grabbed.at(-1)?.stream).toBe(source.stream)
      expect(scan.state).toBe('scanning')
    })

    test('should wait while the stream has no picture yet', async () => {
      const decoder = new TestDecoder()

      await using scan = sut.scan(source, { rate: 1000, decoder })
      grabber.isEmpty = true
      const before = decoder.asked.length
      await pause(20)

      expect(decoder.asked.length).toBe(before)
      expect(scan.state).toBe('scanning')
    })

    test('should merge the options over the configuration', async () => {
      const decoder = new TestDecoder()
      sut = scannerOf({}, { decoder, formats: ['qr_code'], rate: 1000 })

      await using _scan = sut.scan(source, { formats: undefined, region: undefined })
      await waitFor(() => decoder.asked.length > 0)

      expect(decoder.asked[0]).toEqual(['qr_code'])
    })

    test('should not scan a session that has ended', () => {
      source.end()

      expect(() => sut.scan(source)).toThrow(SessionClosedError)
    })
  })

  describe('what is looked at', () => {
    test('should look at one picture at a time, however slow the decoder is', async () => {
      const decoder = new TestDecoder()
      decoder.delay = 10

      await using scan = sut.scan(source, { rate: 1000, decoder })
      await waitFor(() => decoder.asked.length >= 3)
      await scan.stop()

      expect(decoder.mostAtOnce).toBe(1)
    })

    test('should look at nothing while it is paused', async () => {
      const states: CodeScanState[] = []

      await using scan = sut.scan(source, { rate: 1000 })
      scan.on('statechange', (state) => states.push(state))
      scan.pause()
      await pause(5)
      const before = grabber.grabbed.length
      await pause(20)

      expect(grabber.grabbed.length).toBe(before)

      scan.resume()
      await waitFor(() => grabber.grabbed.length > before)

      expect(states).toEqual(['paused', 'scanning'])
    })

    test.each<PageState>(['hidden', 'frozen'])('should look at nothing while the page is %s', async (state) => {
      page.state = state

      await using _scan = sut.scan(source, { rate: 1000 })
      await pause(20)

      expect(grabber.grabbed).toEqual([])
    })

    test('should look at nothing while the session is muted', async () => {
      source.suspend()

      await using _scan = sut.scan(source, { rate: 1000 })
      await pause(20)

      expect(grabber.grabbed).toEqual([])
    })

    test('should go on after a picture the decoder could not read, and say so once', async () => {
      const decoder = new TestDecoder()
      decoder.failure = new Error('broken picture')

      await using scan = sut.scan(source, { rate: 1000, decoder })
      await waitFor(() => decoder.asked.length >= 3)

      expect(scan.state).toBe('scanning')
      expect(logger.warn).toHaveBeenCalledOnce()
    })
  })

  describe('#next', () => {
    test('should resolve with the next code', async () => {
      await using scan = sut.scan(source, { rate: 1000 })
      const next = scan.next()

      FakeBarcodeDetector.codes = [qr('next')]

      expect((await next).value).toBe('next')
    })

    test('should reject when the scan ends first', async () => {
      const scan = sut.scan(source, { rate: 1000 })
      const next = scan.next()

      await scan.stop()

      await expect(next).rejects.toThrow(SessionClosedError)
      await expect(scan.next()).rejects.toThrow(SessionClosedError)
    })

    test('should stop waiting when the signal aborts', async () => {
      await using scan = sut.scan(source, { rate: 1000 })
      const controller = new AbortController()
      const next = scan.next({ signal: controller.signal })

      controller.abort(new Error('the user went back'))

      await expect(next).rejects.toThrow('the user went back')
    })
  })

  describe('the end', () => {
    test('should end with its session, and let go of the pictures', async () => {
      const ends: CodeScanEnd[] = []
      const scan = sut.scan(source, { rate: 1000 })
      scan.on('ended', (end) => ends.push(end))

      source.end()
      await waitFor(() => ends.length > 0)

      expect(ends).toEqual([{ reason: 'source' }])
      expect(scan.state).toBe('ended')
      expect(grabber.isDisposed).toBe(true)
    })

    test('should end with closed when it is stopped, and leave the session running', async () => {
      const ends: CodeScanEnd[] = []
      const scan = sut.scan(source, { rate: 1000 })
      scan.on('ended', (end) => ends.push(end))

      await scan.stop()
      await scan.stop()

      expect(ends).toEqual([{ reason: 'closed' }])
      expect(source.state).toBe('live')
    })

    test('should stop every scan when the scanner is disposed', async () => {
      const first = sut.scan(source, { rate: 1000 })
      const second = sut.scan(new FakeRecordingSource(), { rate: 1000 })

      sut.dispose()
      await waitFor(() => first.state === 'ended' && second.state === 'ended')

      expect([first.state, second.state]).toEqual(['ended', 'ended'])
    })
  })

  describe('#detect', () => {
    test('should read the codes in a picture', async () => {
      FakeBarcodeDetector.codes = [qr('on paper')]

      const codes = await sut.detect(fakeImageData())

      expect(codes).toEqual([{ format: 'qr_code', value: 'on paper', corners: [{ x: 1, y: 2 }] }])
    })

    test('should leave out codes of a kind the library does not know', async () => {
      FakeBarcodeDetector.codes = [{ format: 'unknown', rawValue: 'x', cornerPoints: [] }]

      expect(await sut.detect(fakeImageData())).toEqual([])
    })
  })
})
