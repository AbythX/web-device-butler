# Code scanner

**Goal.** The user points the back camera at a QR code or the bar code of a product, and the application reads it,
in every browser. A code on a picture the user already has can be read as well.

**Demo.** `pnpm demo`, page `use-cases/code-scanner/`. Source:
[`demo/use-cases/code-scanner/main.ts`](../../demo/use-cases/code-scanner/main.ts).

## The decoder

```ts
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { ZxingCodeDecoder } from 'web-device-butler/zxing'

const hasDetector = 'BarcodeDetector' in globalThis

const butler = DefaultDeviceButler.create({
  camera: {
    require: { facing: 'back' },
    prefer: { focus: true, torch: true, width: 1280, height: 720 },
  },
  // the code detector of the browser where there is one, zxing-wasm everywhere else
  scanner: hasDetector ? {} : { decoder: new ZxingCodeDecoder({ wasmUrl }) },
})
```

- A code is read best from a sharp picture: `prefer: { focus: true }` ranks the cameras that can focus higher, and
  `prefer: { torch: true }` gives a light for a dark shelf.
- 1280 by 720 is enough for a code that fills a part of the picture, and decodes faster than more.
- zxing-wasm loads its WASM file only on the first picture, from `wasmUrl`.

## Scanning

```ts
const camera = await butler.camera.open()
preview.srcObject = camera.stream

const scan = butler.scanner.scan(camera, {
  formats: ['qr_code', 'ean_13'],
  region: { x: 0.2, y: 0.3, width: 0.6, height: 0.4 }, // the frame the page draws in the middle
})

scan.on('code', (code) => {
  outline(code.corners)
  showResult(code.format, code.value)
})
```

- Name the formats the application can do something with. A scan that looks for fewer kinds is faster, and does not
  report the bar code of the cereal box next to the ticket.
- A code that stays in sight is reported once. It is reported again once it was out of sight for `repeatAfter`.
- To take one code and be done: `const code = await scan.next()`, then `await scan.stop()`.

## Light

```ts
torchButton.hidden = camera.torch === undefined
torchButton.onclick = () => camera.torch?.toggle()
```

## A picture the user has

```ts
const [file] = await butler.files.pick({ accept: 'image/*' })
const codes = await butler.scanner.detect(file, { formats: ['qr_code'] })
```

An empty list means there is no code the decoder could read. The same works with a photo of the camera:
`await butler.scanner.detect(await camera.takePhoto())`.

## When the user leaves

The scan looks at nothing while the page is in the background, and ends by itself when the camera does. Stop it and
close the camera when the user leaves the screen:

```ts
await scan.stop()
await camera.close()
```

With Vue or React, `useCodeScan(butler.scanner)` holds the scan and the last code as state, and stops the scan when
the component is unmounted.
