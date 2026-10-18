import { prepareZXingModule, readBarcodes, type ReaderOptions, type ReadResult } from 'zxing-wasm/reader'

import type { CodeDecoder } from '../../media/scanning/decoders/code-decoder.ts'
import { type CodeFormat, codeFormats } from '../../media/scanning/model/code-format.ts'
import type { DetectedCode } from '../../media/scanning/model/detected-code.ts'

export interface ZxingCodeDecoderOptions {
  /**
   * Where the page loads the WASM file of `zxing-wasm` from. With Vite:
   * `import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'`. It has to be given, so the decoder does not
   * load code from a server the application did not choose.
   */
  wasmUrl: string
  /** look harder at every picture: finds codes that are small, blurred or turned, and takes longer. Default: `true` */
  tryHarder?: boolean
}

/**
 * Reads codes with zxing-cpp compiled to WASM (`zxing-wasm`), in every browser, also where the browser has no code
 * detector of its own. The file is loaded once, on the first picture.
 *
 * ```ts
 * import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
 * import { ZxingCodeDecoder } from 'web-device-butler/zxing'
 *
 * const butler = DefaultDeviceButler.create({ scanner: { decoder: new ZxingCodeDecoder({ wasmUrl }) } })
 * ```
 */
export class ZxingCodeDecoder implements CodeDecoder {
  public readonly name = 'zxing-wasm'

  /** the names zxing has for the formats of the library */
  private static readonly names: Record<CodeFormat, string> = {
    aztec: 'Aztec',
    codabar: 'Codabar',
    code_39: 'Code39',
    code_93: 'Code93',
    code_128: 'Code128',
    data_matrix: 'DataMatrix',
    ean_8: 'EAN8',
    ean_13: 'EAN13',
    itf: 'ITF',
    pdf417: 'PDF417',
    qr_code: 'QRCode',
    upc_a: 'UPCA',
    upc_e: 'UPCE',
  }

  /** what zxing reports, which names the variant of a format */
  private static readonly variants = new Map<string, CodeFormat>([
    ['AztecCode', 'aztec'],
    ['Code39Std', 'code_39'],
    ['Code39Ext', 'code_39'],
    ['ITF14', 'itf'],
    ['QRCodeModel1', 'qr_code'],
    ['QRCodeModel2', 'qr_code'],
  ])

  private prepared: Promise<unknown> | undefined

  public constructor(private readonly options: ZxingCodeDecoderOptions) {}

  public formats(): Promise<readonly CodeFormat[]> {
    return Promise.resolve(codeFormats)
  }

  public async decode(image: ImageData, formats?: readonly CodeFormat[]): Promise<DetectedCode[]> {
    await this.prepare()

    const options: Partial<ReaderOptions> = {
      tryHarder: this.options.tryHarder ?? true,
      maxNumberOfSymbols: 255,
    }

    if (formats !== undefined) {
      // SAFETY: the table holds a name of zxing for every format of the library
      options.formats = formats.map((format) => ZxingCodeDecoder.names[format]) as ReaderOptions['formats']
    }

    if (options.formats?.length === 0) {
      return []
    }

    // SAFETY: what the reader is not told it takes as its defaults; its types ask for every option
    const results = await readBarcodes(image, options as ReaderOptions)

    return results.flatMap((result) => ZxingCodeDecoder.codeOf(result))
  }

  /**
   * Tells zxing where its WASM file is, and loads it, once for every decoder of the page.
   */
  private prepare(): Promise<unknown> {
    const { wasmUrl } = this.options

    this.prepared ??= prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
      fireImmediately: true,
    })

    return this.prepared
  }

  private static codeOf({ format, text, isValid, position }: ReadResult): DetectedCode[] {
    const known = ZxingCodeDecoder.formatOf(format)

    if (!isValid || known === undefined) {
      return []
    }

    const { topLeft, topRight, bottomRight, bottomLeft } = position
    const corners = [topLeft, topRight, bottomRight, bottomLeft].map(({ x, y }) => ({ x, y }))

    return [{ format: known, value: text, corners }]
  }

  private static formatOf(name: string): CodeFormat | undefined {
    const known = codeFormats.find((format) => ZxingCodeDecoder.names[format] === name)

    return known ?? ZxingCodeDecoder.variants.get(name)
  }
}
