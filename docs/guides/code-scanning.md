# Code scanning

`butler.scanner` reads QR codes, Data Matrix codes and the bar codes of products: in the pictures of a camera while
it runs, and in a single picture, such as a file the user chose.

Try it: `pnpm demo`, page `use-cases/code-scanner/`.

## A decoder for every browser

The codes are read by a decoder. Without one in the configuration, the scanner uses the code detector of the
browser (`BarcodeDetector`). Only Chromium has one, and only on Android, macOS and ChromeOS; Firefox, Safari and
Chromium on Windows and Linux have none. `web-device-butler/zxing` brings a decoder for every browser, on
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm), which the application installs:

```sh
pnpm add zxing-wasm
```

```ts
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url' // Vite; other bundlers have their own way
import { ZxingCodeDecoder } from 'web-device-butler/zxing'

const butler = DefaultDeviceButler.create({
  scanner: { decoder: new ZxingCodeDecoder({ wasmUrl }) },
})
```

- `wasmUrl` has to be given: the decoder loads its WASM file from there, on the first picture, and from nowhere
  else. Serve it from your own origin.
- The file is about 1 MB. To keep the code detector of the browser where there is one, configure the decoder only
  where `'BarcodeDetector' in globalThis` is `false`, as the demo does.
- `tryHarder: false` reads faster and misses codes that are small, blurred or turned.

`butler.scanner.isSupported` says whether there is a decoder; `await butler.scanner.formats()` says what it can read
here. The code detector of a browser can exist and read nothing.

## Scanning a camera

```ts
await using camera = await butler.camera.open({ require: { facing: 'back' }, prefer: { focus: true, torch: true } })
await using scan = butler.scanner.scan(camera, { formats: ['qr_code'] })

const code = await scan.next() // { format: 'qr_code', value: 'https://...', corners: [...] }
```

Or listen to every code that comes into sight:

```ts
scan.on('code', ({ format, value, corners }) => show(value))
```

| Option        | Meaning                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `formats`     | the kinds of codes to look for. Default: every kind the decoder can read. Fewer are found faster. |
| `rate`        | how many pictures are looked at per second, at most. Default: `10`.                             |
| `region`      | the part of the picture to look at, as fractions: `{ x: 0.2, y: 0.3, width: 0.6, height: 0.4 }` for a frame in the middle. Smaller is faster. |
| `repeatAfter` | how long a code has to be out of sight before it is reported again, in milliseconds. Default: `2000`, so a code held in front of the camera is reported once. |
| `decoder`     | another decoder for this scan                                                                   |

The `scanner` section of the configuration takes the same options as defaults; the options of a call are merged
over them.

- The scan looks at nothing while the page is in the background or the session is muted, and at one picture at a
  time: a slow decoder lowers the rate instead of piling up work.
- `pause()` and `resume()` stop and start looking; `stop()` ends the scan. The session keeps running either way.
- The scan ends with `source` when its session ends, and with `closed` when it is stopped. `next()` rejects with a
  `SessionClosedError` then.
- A session that continues with a new stream, such as a camera that was switched, keeps being scanned.
- Any session with a picture can be scanned: a camera, the camera and microphone of `butler.media.open()`, or a
  [capture of the screen](screen-capture.md).

### Drawing the corners

`corners` are in the pixels of the whole picture, also when only a region was looked at, clockwise from the top
left of the code. An overlay canvas with the size of the picture, scaled by the page like the video, draws them as
they are:

```ts
overlay.width = video.videoWidth
overlay.height = video.videoHeight
context.beginPath()
code.corners.forEach(({ x, y }, index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)))
context.closePath()
context.stroke()
```

## Reading a picture

```ts
const [file] = await butler.files.pick({ accept: 'image/*' })
const codes = await butler.scanner.detect(file, { formats: ['qr_code', 'ean_13'] })
```

`detect()` takes a file, an `ImageBitmap`, a canvas, an image or video element of the page, or `ImageData`. It
resolves with every code in the picture, an empty list if there is none. It takes `formats`, `region` and `decoder`.

## A decoder of your own

A decoder implements `CodeDecoder`: a `name`, `formats()`, and `decode(image, formats)` that gets the pixels as
`ImageData` and resolves with the codes it found. The scanner takes care of the pictures, the region, the rate and
of reporting each code once.

## Errors

| Error                | Thrown when                                                                     |
| -------------------- | ------------------------------------------------------------------------------- |
| `UnsupportedError`   | there is no decoder: none in the configuration, and the browser has no code detector; or `detect()` is given a file the browser cannot decode |
| `SessionClosedError` | `scan()` is given a session that has ended, or `next()` waits on a scan that ends |

A picture the decoder cannot read does not end a scan: it is reported to the logger once, and the next picture is
looked at.

## Not verified yet

The decoder of zxing-wasm is tested in Chromium, Firefox and WebKit with codes its writer drew, from files, from
regions of a canvas and from the stream of a canvas. The code detector of the browser is tested against a fake: the
browsers of the specs have none. Neither has been run on a phone; how many pictures a phone reads per second is an
open question of the [device matrix](../device-matrix/README.md).
