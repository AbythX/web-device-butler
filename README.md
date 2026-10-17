# web-device-butler

One library for the browser APIs that are tied to the device: storage, camera, microphone, recording, screen capture,
code scanning, location, screen, network, sharing.
An application says what it needs, not how the browser provides it.

- **Storage**: one interface over `localStorage`, `sessionStorage`, OPFS, IndexedDB and memory.
- **Camera and microphone**: choose a device by what it can do ("a back camera with a torch"), not by guessing a
  `deviceId`.
- **Recording and photos**: a format the browser can write, a recording that survives a camera that is started
  again, a photo from every browser.
- **Screen capture**: say what the user should share, and get told when what they chose does not have it; record it
  together with their voice.
- **Code scanning**: QR codes and bar codes from a camera or a picture, with the code detector of the browser where
  there is one and zxing-wasm everywhere else.
- **Several tabs**: the same application in two tabs does not lose stored updates and does not fight over the camera.
- **Not losing what was captured**: files saved where the user finds them, an outbox that sends once there is a
  network, recordings that are kept in the storage while they run and found again after the page went away.
- **No runtime dependencies** in the core. Vue, React, inversify and fabric are optional entry points.

This page is a tour. The rest is in [`docs`](docs/README.md):

- **Guides** per area: [getting started](docs/guides/getting-started.md), [camera](docs/guides/camera.md),
  [microphone](docs/guides/microphone.md), [recording](docs/guides/recording.md),
  [screen capture](docs/guides/screen-capture.md), [code scanning](docs/guides/code-scanning.md),
  [storage](docs/guides/storage.md), [screen, network, sharing](docs/guides/screen-network-sharing.md),
  [files, the outbox, the page](docs/guides/files-outbox-page.md),
  [location, orientation, permissions](docs/guides/location-orientation-permissions.md),
  [several tabs](docs/guides/multiple-tabs.md), [errors](docs/guides/errors.md).
- **Use cases** with complete code: a [document scanner](docs/use-cases/document-scanner.md),
  [voice memos](docs/use-cases/voice-memo.md), a [video message](docs/use-cases/video-message.md),
  [settings in several tabs](docs/use-cases/settings-across-tabs.md), a [set-up screen](docs/use-cases/set-up-screen.md),
  a [camera with an overlay](docs/use-cases/camera-with-overlay.md), [recording a route](docs/use-cases/track-a-route.md),
  a [field report](docs/use-cases/field-report.md) that is sent once there is a network, a
  [screen tutorial](docs/use-cases/screen-tutorial.md) with the voice of the user, a
  [code scanner](docs/use-cases/code-scanner.md).
- **Demos** that run them: `pnpm demo`, see [`demo`](demo/README.md).

> **Status.** Early releases, on GitHub Packages only. Everything is tested against fakes and in Chromium and Firefox with the fake
> devices of the browsers. It has not been run on real phones and not in Safari; see
> [`docs/device-matrix`](docs/device-matrix/README.md).

> **Developed with AI.** The code, the specs and the documentation were written with the help of AI (Claude Code)
> and reviewed by the author. Mistakes may have slipped through, and there is no guarantee that everything works as
> described; the [license](LICENSE) says the same in legal terms. Development continues, and reports of anything
> that is wrong are welcome.

## Installing

The releases are published to GitHub Packages as `@abythx/web-device-butler`, not to npmjs.com. Versions follow the
calendar: `YEAR.MONTH.RELEASE`, for example `2026.10.0`.

GitHub Packages asks for a token even for public packages. Create a personal access token with the scope
`read:packages` and add this to the `.npmrc` of your project, with the token in the environment:

```ini
@abythx:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Install it under the name the examples import from:

```sh
pnpm add web-device-butler@npm:@abythx/web-device-butler
```

Without a token, download the `.tgz` of a [release](https://github.com/AbythX/web-device-butler/releases) and install
that file.

## Getting started

```ts
import { DefaultDeviceButler } from 'web-device-butler'

const butler = DefaultDeviceButler.create({
  camera: { require: { facing: 'back', torch: true }, prefer: { width: 1920, height: 1080 } },
  storage: { namespace: 'my-app' },
})
```

`DefaultDeviceButler.create()` touches nothing of the browser and shows no prompt, so it is safe during server side
rendering. Every call returns a new object; keep the one you need. `await butler.dispose()` releases everything it
holds.

What it returns is typed by interfaces (`DeviceButler`, `CameraManager`, `CameraSession`, `Store`, ...). Those are the
types for your own code; the classes behind them are named `Default...` and only needed to create something. See
[interfaces and their implementations](docs/guides/getting-started.md#interfaces-and-their-implementations).

Objects that hold a resource also work with `using` and `await using`.

## Camera

```ts
// optional, on a set-up screen: asks for permission and looks at the cameras
const { camera } = await butler.prepare({ camera: true })
if (camera?.error) showWhyThereIsNoCamera(camera.error)

await using session = await butler.camera.open()
video.srcObject = session.stream

await session.torch?.set(true) // `undefined` if this camera has no torch
await session.zoom?.set(2)
await session.configure({ width: 1280, height: 720 })
await session.switchTo({ require: { facing: 'front' } })
const photo = await session.takePhoto() // a Blob

session.on('ended', ({ reason }) => {
  /* 'closed' | 'taken-over' | 'device' */
})
```

- `open(requirements)` merges the requirements over the configured defaults. A field of the call replaces the
  configured field as a whole.
- `require` and `prefer` take the same traits: the side, torch, zoom, focus, width, height, frame rate. `require`
  never returns a camera without them. `prefer` ranks the cameras that are left and says what the running camera
  is asked to deliver. If nothing fits, `open()` fails with a `MediaRequirementsError` that says which requirement
  removed which camera.
- To find out what a camera can do, the library has to start it. That happens once; the result is remembered.
  `butler.camera.list({ detail: 'probed' })` looks at every camera, `butler.camera.forget()` starts over.
- Only one tab can run a camera. What happens when another tab holds it is a policy:
  `whenBusy: 'fail'` (default), `'wait'` or `'takeover'`. A session refuses a take-over with
  `session.allowTakeover = false`, for example while it records.

## Microphone

```ts
await using microphone = await butler.microphone.open({ prefer: { noiseSuppression: false } })

await microphone.processing.set({ echoCancellation: false })
microphone.muted = true
microphone.level?.on('change', (level) => drawLevel(level)) // 0 to 1, measured only while someone listens
```

Several tabs can record at once; `exclusive: true` keeps the others out. Changing the processing of a running
microphone can start it again in browsers that cannot change it in place (Chrome): the session stays, its track is
a new one.

### Both together

```ts
await using both = await butler.media.open({ camera: { require: { facing: 'back' } } })

await both.camera.torch?.set(true)
```

## Recording

```ts
const recording = await butler.recorder.record(both, { keepAwake: true })

recording.pause()
recording.resume()

const { blob, mimeType, duration } = await recording.stop()
```

- The format is the first of the common ones the browser can write, MP4 before WebM, or the first of yours:
  `format: ['video/webm;codecs=vp9', 'video/mp4']`. `butler.recorder.formats('video')` lists them.
- While it runs, other tabs cannot take the device, and with `keepAwake` the screen stays on.
- A device that is started again or switched continues the recording in a new segment (`result.segments`), because
  a browser cannot continue a file with another track.
- `into: (segment) => store.writeStream(key)` writes the recording into a stream instead of memory.
- `keep: { namespace: 'memos' }` keeps it in the storage piece by piece while it runs. A page that is thrown away
  loses at most the last second, and the next visit finds the recording in `butler.recorder.kept('memos')` as
  `interrupted`.

## Screen capture

```ts
// in answer to a click: the browser shows its picker only then
await using screen = await butler.screenCapture.open({
  require: { audio: true },
  prefer: { surface: 'window' },
  content: 'text',
})

screen.surface // what the user chose: 'monitor' | 'window' | 'browser'
screen.on('ended', ({ reason }) => {
  /* 'device': the user pressed "stop sharing" */
})

// the screen with the voice of the user, in one recording
await using microphone = await butler.microphone.open()
const recording = await butler.recorder.record(butler.media.join(screen, microphone))
```

- `prefer` is a hint for the picker and for what the browser delivers. `require` is checked once the user has
  chosen: a capture without it is stopped, and `open()` fails with a `MediaRequirementsError` that names it.
- `isSupported` is `false` on phones, whose browsers cannot capture the screen.
- No other tab can take a capture over; several can run at once.

## Code scanning

```ts
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { ZxingCodeDecoder } from 'web-device-butler/zxing'

// without a decoder, the code detector of the browser, which only Chromium has on some systems
const butler = DefaultDeviceButler.create({ scanner: { decoder: new ZxingCodeDecoder({ wasmUrl }) } })

await using camera = await butler.camera.open({ require: { facing: 'back' }, prefer: { focus: true } })
await using scan = butler.scanner.scan(camera, { formats: ['qr_code', 'ean_13'] })

const { format, value, corners } = await scan.next()

const codes = await butler.scanner.detect(file) // a picture the user chose
```

- A code that stays in sight is reported once (`repeatAfter`). `region` looks at a part of the picture only; the
  corners are in the pixels of the whole picture.
- The scan looks at no more than `rate` pictures per second (default 10), one at a time, and at none while the page
  is in the background or the camera is muted.

## Storage

```ts
const settings = await butler.storage.open<Settings>({ driver: ['indexeddb', 'local'], namespace: 'settings' })

// or say what the store needs and let the library choose the backend
const recordings = await butler.storage.open({
  namespace: 'recordings',
  require: { persistence: 'origin', binary: true },
  prefer: { streaming: true },
})

await settings.set('theme', { dark: true })
await settings.get('theme')
await settings.update('visits', (count = 0) => count + 1) // safe when several tabs do it at once

settings.on('change', ({ key, origin }) => {
  /* origin: 'local' | 'remote' (another tab) */
})
```

- `driver` is a name or a fallback chain; the first driver the browser supports is used.
  `store.capabilities` says which one it is and what it can do.
- Large data is read and written as streams (`readStream`, `writeStream`) on `opfs` and `memory`
  (`capabilities.streaming`).
- `localStorage` reaches other tabs with a delay in Firefox and Safari
  (`capabilities.consistentAcrossTabs === false`). Data that several tabs update at once belongs in `indexeddb`.
- `butler.storage.space()` reports quota and usage, `butler.storage.persist()` asks the browser not to evict.

## Location, orientation, platform, permissions

```ts
const position = await butler.location.current({ highAccuracy: true })

// never further off than 100 m, and within 10 m if that arrives in time
const precise = await butler.location.current({
  require: { accuracy: 100 },
  prefer: { accuracy: 10 },
  highAccuracy: true,
  timeout: 15_000,
})

using watch = butler.location.watch()
watch.on('position', (position) => {
  /* DevicePosition */
})

butler.orientation.current // 'portrait' | 'landscape'
butler.orientation.on('change', (orientation) => {})

butler.platform.isIos

await butler.permission.query('camera') // 'granted' | 'denied' | 'prompt' | 'unknown' | 'unsupported'
await butler.permission.request('geolocation')
```

## Screen, network, sharing

```ts
using hold = await butler.wakeLock.request() // the screen stays on, also after the page was in the background

await butler.fullscreen.enter(preview) // in answer to a click
await butler.orientation.lock('landscape')

butler.network.isOnline // false: no network
butler.network.on('change', (isOnline) => {})

await butler.share.share({ title: 'Scan', files: [file] }) // false if the user closed the sheet
await butler.clipboard.writeText(link)

await butler.audioOutput.route(player, (await butler.audioOutput.list())[1])
```

Each part says whether the browser has it (`isSupported`, `canEnter()`, `canShare()`, `canRoute()`).

## Files, the outbox, the page

```ts
await butler.files.save(photo, { name: 'scan.jpg' }) // 'saved' | 'downloaded' | 'cancelled'
const [picked] = await butler.files.pick({ accept: 'image/*', capture: 'environment' })

const uploads = await butler.outbox.open<Upload>({ namespace: 'uploads', send: (item, { id, signal }) => post(item) })
await uploads.add(upload) // sent now, or once there is a network, also after the page was closed

butler.page.on('change', (state) => {
  if (state !== 'visible') save() // the last moment a page on a phone can count on
})
```

- The outbox sends in order and from one tab at a time. A failure keeps the item and is tried again after a wait
  that grows, when the network returns, or with `flush()`.
- A recording uses the page itself: it has the browser hand over its data when the page is hidden.

## Errors

Every error extends `DeviceButlerError`, sets `name` and keeps the error of the browser as `cause`. The names of
`DOMException` never reach the application.

| Error                                                  | Meaning                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `PermissionDeniedError`                                | the user or the browser refused                            |
| `UnsupportedError`                                     | the browser or the page (no HTTPS) does not have it        |
| `MediaDeviceBusyError`                                 | held by this tab, another tab or something else (`holder`) |
| `MediaRequirementsError`                               | no device can deliver what was required                    |
| `MediaDeviceNotFoundError`                             | there is no such device                                    |
| `SessionClosedError`                                   | the session has ended                                      |
| `LocationUnavailableError`, `LocationTimeoutError`     | the position could not be determined                       |
| `LocationRequirementsError`                            | no position had what was required in time                  |
| `StorageQuotaExceededError`, `StorageLockedError`, ... | see `StorageError`                                         |
| `ScreenError`, `SharingError`, `FileError`             | the browser did not fill the screen, share, copy or save   |

## Entry points

| Import                                                             | Contains                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `web-device-butler`                                                | the whole core                                                                         |
| `web-device-butler/storage`, `/camera`, `/microphone`, `/location` | one area, with its own `create()` factory                                              |
| `web-device-butler/screen-capture`                                 | the capture of the screen, with its own `create()` factory                             |
| `web-device-butler/media`, `/permission`, `/platform`              | the combined session, joined sessions, recording, audio outputs, permissions, platform |
| `web-device-butler/network`, `/screen`, `/sharing`                 | online state; wake lock and fullscreen; share sheet and clipboard                      |
| `web-device-butler/files`, `/outbox`                               | saving and choosing files; sending once there is a network                             |
| `web-device-butler/react`                                          | hooks, needs `react` 18 or later                                                       |
| `web-device-butler/vue`                                            | composables, needs `vue`                                                               |
| `web-device-butler/inversify`                                      | container module, needs `inversify` 8                                                  |
| `web-device-butler/scanning`                                       | the reader of codes, with its own `create()` factory                                   |
| `web-device-butler/zxing`                                          | a decoder of codes for every browser, needs `zxing-wasm`                               |
| `web-device-butler/fabric`                                         | canvas renderer of a camera, needs `fabric`                                            |

### Vue

```ts
import { useDeviceButler, useCamera, useStoredValue } from 'web-device-butler/vue'

const butler = useDeviceButler() // from app.provide(deviceButlerInjectionKey, butler)
const camera = useCamera(butler.camera) // session, state, settings, error, isOpening, open(), close()
const theme = useStoredValue(settingsStore, 'theme') // follows other components and other tabs
```

Sessions and watches are closed when the component is unmounted. Also: `useMicrophone`, `useScreenCapture`,
`useCodeScan`, `useOrientation`, `useLocation`, `useNetwork`, `useWakeLock`, `useRecording`, `useFullscreen`.

### React

```tsx
import { DeviceButlerContext, useDeviceButler, useCamera, useRecording } from 'web-device-butler/react'

const App = () => (
  <DeviceButlerContext value={butler}>
    <Capture />
  </DeviceButlerContext>
)

const Capture = () => {
  const butler = useDeviceButler()
  const camera = useCamera(butler.camera) // session, state, settings, error, isOpening, open(), close()
  const recording = useRecording(butler.recorder) // state, duration, result, start(), stop()
  // ...
}
```

The same hooks as the Vue composables, with plain values instead of refs: `useMicrophone` (with `setMuted()`),
`useScreenCapture`, `useCodeScan`, `useOrientation`, `useLocation`, `useNetwork`, `useWakeLock`, `useFullscreen`, `useStoredValue`. Sessions,
recordings and watches are closed when the component is unmounted. Before React 19 the provider is
`<DeviceButlerContext.Provider value={butler}>`.

### inversify

```ts
import { DeviceButlerBindings, DeviceButlerContainerModule } from 'web-device-butler/inversify'

container.load(new DeviceButlerContainerModule(butler))
container.get(DeviceButlerBindings.Camera) // CameraManager
```

### fabric

```ts
import { FabricCameraFactory } from 'web-device-butler/fabric'

using renderer = await new FabricCameraFactory().create(session)
renderer.add(overlayGroup)
renderer.resize(element.clientWidth, element.clientHeight)
renderer.output // the StaticCanvas, to show and to record
```

## Development

```sh
pnpm install
pnpm check          # format, lint, types, all tests, build
pnpm test:unit      # every class against fakes
pnpm test:browser   # Chromium, Firefox and WebKit through Playwright, including a second tab
pnpm demo           # the demo pages over HTTPS; `pnpm demo:lan` to reach them from a phone
```

The browser specs need the browsers of Playwright: `pnpm exec playwright install`.

## License

[MIT](LICENSE)
