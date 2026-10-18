import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { ScopedLogger } from '../../core/logging/scoped-logger.ts'
import { DefaultPageLifecycle } from '../../platform/page/default-page-lifecycle.ts'
import type { PageLifecycle } from '../../platform/page/page-lifecycle.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { CodeScanner, CodeScannerConfiguration } from './code-scanner.ts'
import { CodeScanSupport } from './code-scan-support.ts'
import { BarcodeDetectorDecoder } from './decoders/barcode-detector-decoder.ts'
import type { CodeDecoder } from './decoders/code-decoder.ts'
import { CodePictures, type CodeImage } from './frames/code-picture.ts'
import type { FrameGrabber } from './frames/frame-grabber.ts'
import { VideoFrameGrabber } from './frames/video-frame-grabber.ts'
import type { CodeFormat } from './model/code-format.ts'
import { type DetectedCode, shiftCode } from './model/detected-code.ts'
import type { CodeScan, CodeScanOptions, CodeScanSource } from './scan/code-scan.ts'
import { DefaultCodeScan } from './scan/default-code-scan.ts'

/**
 * The implementation of {@link CodeScanner}.
 */
export class DefaultCodeScanner implements CodeScanner {
  /**
   * For applications that only read codes. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    configuration: CodeScannerConfiguration = {},
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): CodeScanner {
    return new DefaultCodeScanner(configuration, environment, new DefaultPageLifecycle(environment, logger), logger)
  }

  private native: BarcodeDetectorDecoder | undefined
  private readonly scans = new Set<CodeScan>()

  /**
   * @param page tells the scans when the page is in the background
   * @param grabberFor takes the pictures of a scan
   */
  public constructor(
    private readonly configuration: CodeScannerConfiguration,
    private readonly environment: BrowserEnvironment,
    private readonly page: PageLifecycle,
    private readonly logger: Logger,
    private readonly grabberFor: () => FrameGrabber = () =>
      new VideoFrameGrabber(environment, new ScopedLogger('VideoFrameGrabber', logger))
  ) {}

  public get isSupported(): boolean {
    return this.configuration.decoder !== undefined || CodeScanSupport.hasBuiltInDecoderIn(this.environment)
  }

  public formats(decoder?: CodeDecoder): Promise<readonly CodeFormat[]> {
    return (decoder ?? this.decoderFor(this.configuration)).formats()
  }

  public scan(source: CodeScanSource, options: CodeScanOptions = {}): CodeScan {
    if (source.state === 'ended') {
      throw new SessionClosedError()
    }

    const merged = { ...this.configuration, ...DefaultCodeScanner.set(options) }
    const decoder = this.decoderFor(merged)

    const scan = new DefaultCodeScan(
      source,
      decoder,
      merged,
      this.grabberFor(),
      this.page,
      new ScopedLogger('CodeScan', this.logger)
    )

    this.scans.add(scan)
    scan.on('ended', () => this.scans.delete(scan))
    this.logger.debug(`Scanning with ${decoder.name}`, merged.formats ?? 'every format')

    return scan
  }

  public async detect(
    image: CodeImage,
    options: Omit<CodeScanOptions, 'rate' | 'repeatAfter'> = {}
  ): Promise<DetectedCode[]> {
    const merged = { ...this.configuration, ...DefaultCodeScanner.set(options) }
    const decoder = this.decoderFor(merged)
    const pictures = new CodePictures(this.environment)

    try {
      const { image: pixels, offset } = await pictures.of(image, merged.region)
      const codes = await decoder.decode(pixels, merged.formats)

      return codes.map((code) => shiftCode(code, offset))
    } finally {
      pictures.dispose()
    }
  }

  public dispose(): void {
    for (const scan of [...this.scans]) {
      void scan.stop()
    }
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  /**
   * @throws UnsupportedError where there is no decoder
   */
  private decoderFor(options: CodeScanOptions): CodeDecoder {
    if (options.decoder !== undefined) {
      return options.decoder
    }

    const BarcodeDetector = CodeScanSupport.resolveFor(this.environment)

    if (BarcodeDetector === undefined) {
      throw new UnsupportedError('BarcodeDetector')
    }

    this.native ??= new BarcodeDetectorDecoder(BarcodeDetector)

    return this.native
  }

  /**
   * The options that are set, so one that is `undefined` does not hide the configured one.
   */
  private static set<Options extends object>(options: Options): Partial<Options> {
    // SAFETY: the entries are those of the options, of which some are left out
    return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as Partial<Options>
  }
}
