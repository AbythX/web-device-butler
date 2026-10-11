# web-device-butler

One library for the browser APIs that are tied to the device: storage, camera, microphone, location, orientation.
An application says what it needs, not how the browser provides it.

- **Storage**: one interface over `localStorage`, `sessionStorage`, OPFS, IndexedDB and memory.
- **Camera and microphone**: choose a device by what it can do ("a back camera with a torch"), not by guessing a
  `deviceId`.
- **Several tabs**: the same application in two tabs does not lose stored updates and does not fight over the camera.
- **No runtime dependencies** in the core. Vue, inversify and fabric are optional entry points.

This page is a tour. The rest is in [`docs`](docs/README.md):

- **Guides** per area: [getting started](docs/guides/getting-started.md), [camera](docs/guides/camera.md),
  [microphone](docs/guides/microphone.md), [storage](docs/guides/storage.md),
  [location, orientation, permissions](docs/guides/location-orientation-permissions.md),
  [several tabs](docs/guides/multiple-tabs.md), [errors](docs/guides/errors.md).
- **Use cases** with complete code: a [document scanner](docs/use-cases/document-scanner.md),
  [voice memos](docs/use-cases/voice-memo.md), a [video message](docs/use-cases/video-message.md),
  [settings in several tabs](docs/use-cases/settings-across-tabs.md), a [set-up screen](docs/use-cases/set-up-screen.md),
  a [camera with an overlay](docs/use-cases/camera-with-overlay.md), [recording a route](docs/use-cases/track-a-route.md).
- **Demos** that run them: `pnpm demo`, see [`demo`](demo/README.md).

The design, the decisions behind it and what is verified on which browser are in
[`docs/plan/device-library.md`](docs/plan/device-library.md).

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
import { DefaultDevice } from 'web-device-butler'

const device = DefaultDevice.create({
  camera: { facing: 'back', require: { torch: true }, resolution: { width: 1920, height: 1080 } },
  storage: { namespace: 'my-app' },
})
```

`DefaultDevice.create()` touches nothing of the browser and shows no prompt, so it is safe during server side
rendering. Every call returns a new object; keep the one you need. `await device.dispose()` releases everything it
holds.

What it returns is typed by interfaces (`Device`, `CameraManager`, `CameraSession`, `Store`, ...). Those are the
types for your own code; the classes behind them are named `Default...` and only needed to create something. See
[interfaces and their implementations](docs/guides/getting-started.md#interfaces-and-their-implementations).

Objects that hold a resource also work with `using` and `await using`.

## Camera

```ts
// optional, on a set-up screen: asks for permission and looks at the cameras
const { camera } = await device.initialize({ camera: true })
if (camera?.error) showWhyThereIsNoCamera(camera.error)

await using session = await device.camera.open()
video.srcObject = session.stream

await session.torch?.set(true) // `undefined` if this camera has no torch
await session.zoom?.set(2)
await session.configure({ resolution: { width: 1280, height: 720 } })
await session.switchTo({ facing: 'front', require: {} })

session.on('ended', ({ reason }) => {
  /* 'closed' | 'taken-over' | 'device' */
})
```

- `open(requirements)` merges the requirements over the configured defaults. A field of the call replaces the
  configured field as a whole.
- `require` never returns a camera without the feature. `prefer` ranks. If nothing fits, `open()` fails with a
  `MediaRequirementsError` that says which requirement removed which camera.
- To find out what a camera can do, the library has to start it. That happens once; the result is remembered.
  `device.camera.list({ detail: 'probed' })` looks at every camera, `device.camera.forget()` starts over.
- Only one tab can run a camera. What happens when another tab holds it is a policy:
  `whenBusy: 'fail'` (default), `'wait'` or `'takeover'`. A session refuses a take-over with
  `session.allowTakeover = false`, for example while it records.

## Microphone

```ts
await using microphone = await device.microphone.open({ processing: { noiseSuppression: false } })

await microphone.processing.set({ echoCancellation: false })
microphone.muted = true
microphone.level?.on('change', (level) => drawLevel(level)) // 0 to 1, measured only while someone listens
```

Several tabs can record at once; `exclusive: true` keeps the others out. Changing the processing of a running
microphone can start it again in browsers that cannot change it in place (Chrome): the session stays, its track is
a new one.

### Both together

```ts
await using recording = await device.media.open({ camera: { facing: 'back' } })

new MediaRecorder(recording.stream).start()
await recording.camera.torch?.set(true)
```

## Storage

```ts
const settings = await device.storage.open<Settings>({ driver: ['indexeddb', 'local'], namespace: 'settings' })

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
- `device.storage.space()` reports quota and usage, `device.storage.persist()` asks the browser not to evict.

## Location, orientation, platform, permissions

```ts
const position = await device.location.current({ highAccuracy: true })

using watch = device.location.watch()
watch.on('position', (position) => {
  /* DevicePosition */
})

device.orientation.current // 'portrait' | 'landscape'
device.orientation.on('change', (orientation) => {})

device.platform.isIos

await device.permission.query('camera') // 'granted' | 'denied' | 'prompt' | 'unknown' | 'unsupported'
await device.permission.request('geolocation')
```

## Errors

Every error extends `DeviceError`, sets `name` and keeps the error of the browser as `cause`. The names of
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
| `StorageQuotaExceededError`, `StorageLockedError`, ... | see `StorageError`                                         |

## Entry points

| Import                                                             | Contains                                    |
| ------------------------------------------------------------------ | ------------------------------------------- |
| `web-device-butler`                                                | the whole core                              |
| `web-device-butler/storage`, `/camera`, `/microphone`, `/location` | one area, with its own `create()` factory   |
| `web-device-butler/media`, `/permission`, `/platform`              | the combined session, permissions, platform |
| `web-device-butler/vue`                                            | composables, needs `vue`                    |
| `web-device-butler/inversify`                                      | container module, needs `inversify`         |
| `web-device-butler/fabric`                                         | canvas renderer of a camera, needs `fabric` |

### Vue

```ts
import { useCamera, useDevice, useStoredValue } from 'web-device-butler/vue'

const device = useDevice() // from app.provide(deviceInjectionKey, device)
const camera = useCamera(device.camera) // session, state, settings, error, isOpening, open(), close()
const theme = useStoredValue(settingsStore, 'theme') // follows other components and other tabs
```

Sessions and watches are closed when the component is unmounted. Also: `useMicrophone`, `useOrientation`,
`useLocation`.

### inversify

```ts
import { DeviceBindings, DeviceContainerModule } from 'web-device-butler/inversify'

container.load(new DeviceContainerModule(device))
container.get(DeviceBindings.Camera) // CameraManager
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
