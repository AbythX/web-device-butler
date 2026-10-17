# Getting started

## The butler

Everything starts at one object:

```ts
import { ConsoleLogger, DefaultDeviceButler } from 'web-device-butler'

const butler = DefaultDeviceButler.create({
  logger: new ConsoleLogger(),
  camera: { require: { facing: 'back', torch: true }, prefer: { width: 1920, height: 1080 } },
  microphone: { prefer: { noiseSuppression: true } },
  storage: { namespace: 'my-app' },
})
```

`DefaultDeviceButler.create()` touches nothing of the browser. It shows no prompt, starts no device and opens no database, so
it can run at module level, during server-side rendering and in a test.

Every call returns a new object. There is no hidden global: create the butler once, where the application starts,
and hand it to whoever needs it (a container with [`web-device-butler/inversify`](../../README.md#inversify), the
components with [`web-device-butler/vue`](../../README.md#vue), or an import of your own module).

| Property             | What it is for                                                        | Guide                                              |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| `butler.camera`      | lists and selects cameras, opens camera sessions                      | [Camera](camera.md)                                |
| `butler.microphone`  | the same for microphones                                              | [Microphone](microphone.md)                        |
| `butler.media`       | opens a camera and a microphone as one session                        | [Microphone](microphone.md#camera-and-microphone-together) |
| `butler.screenCapture` | captures a screen, a window or a tab the user chooses               | [Screen capture](screen-capture.md)                |
| `butler.scanner`     | reads QR codes and bar codes from a camera or a picture               | [Code scanning](code-scanning.md)                  |
| `butler.storage`     | opens stores, reports the space of the origin                         | [Storage](storage.md)                              |
| `butler.location`    | where the device is                                                   | [Location, ...](location-orientation-permissions.md) |
| `butler.orientation` | how the device is held                                                | [Location, ...](location-orientation-permissions.md#orientation) |
| `butler.motion`      | how the device is turned and moves, and where it points               | [Location, ...](location-orientation-permissions.md#motion-and-heading) |
| `butler.platform`    | iOS or Android                                                        | [Location, ...](location-orientation-permissions.md#platform) |
| `butler.notifications` | shows notifications of the system, only while nobody looks if asked | [Notifications, ...](notifications-vibration.md)   |
| `butler.vibration`   | makes the device vibrate                                              | [Notifications, ...](notifications-vibration.md#vibration) |
| `butler.permission`  | the state of every permission, and requesting them                    | [Location, ...](location-orientation-permissions.md#permissions) |
| `butler.coordination`| whether the browser can coordinate tabs                               | [Several tabs](multiple-tabs.md)                   |

An application that needs one area only can import it alone, with its own factory:

```ts
import { DefaultStorageManager } from 'web-device-butler/storage'

const storage = DefaultStorageManager.create({ namespace: 'my-app' })
```

The same exists for `/camera` (`DefaultCameraManager.create()`), `/microphone` (`DefaultMicrophoneManager.create()`),
`/location` (`DefaultDeviceLocation.create()`), `/screen-capture` (`DefaultScreenCaptureManager.create()`),
`/scanning` (`DefaultCodeScanner.create()`), `/motion` (`DefaultDeviceMotion.create()`) and `/attention`
(`DefaultDeviceVibration.create()`).

## Interfaces and their implementations

What an application works with are interfaces: `DeviceButler`, `CameraManager`, `CameraSession`, `Store`, `TorchControl`
and so on. They are the types to write in your own code, and they are what a test replaces:

```ts
import type { DeviceButler, CameraSession, Store } from 'web-device-butler'

class Scanner {
  public constructor(
    private readonly butler: DeviceButler,
    private readonly pages: Store<Uint8Array>
  ) {}

  public start(): Promise<CameraSession> {
    return this.butler.camera.open()
  }
}
```

The classes behind them carry a prefix: `DefaultDeviceButler`, `DefaultCameraManager`, `DefaultStore`. An application names
them in one place only, where it creates the butler (`DefaultDeviceButler.create()`). Everything else it gets from the
butler, typed by the interface. `BaseMediaInputManager` and `BaseMediaSession` are the bases for a manager and a
session of your own.

Values stay classes without an interface, because there is nothing to replace: descriptors, features, settings,
positions and errors. Errors in particular are checked with `instanceof`.

## The configuration sets defaults

The `camera` and `microphone` sections have the same shape as the argument of `open()`. The configuration says what
the application usually wants; a call overrides single fields of it:

```ts
const butler = DefaultDeviceButler.create({
  camera: { require: { facing: 'back', torch: true }, prefer: { width: 1920, height: 1080 } },
})

await butler.camera.open() // a back camera with a torch
await butler.camera.open({ require: { facing: 'front' } }) // a front camera, torch not required
```

`require` says what a device must have, `prefer` what it should have; both take the same traits. A field of the
call replaces the configured field as a whole: the `require` above removes the requirement for a torch, it does not
merge with it. The same holds for `prefer`: a call that prefers something else no longer prefers the configured
width and height, unless it names them again.

The other sections work the same way. `storage` takes a `require` and a `prefer` for the backend of a store, and
`location` for the position that comes back; see [Storage](storage.md#letting-the-library-choose) and
[Location](location-orientation-permissions.md#asking-for-a-position-that-is-good-enough).

`butler.camera.configure(changes)` changes the defaults later, for example when the user picks another resolution in
the settings of the application.

## Asking early: `prepare()`

Opening a camera for the first time is slow and visible: the browser asks for permission, and the library has to
start cameras to find out what they can do. `prepare()` does that work at a moment you choose, typically on a
set-up screen:

```ts
// without options: what has a section in the configuration, and the camera and the microphone if neither has one
const { camera, microphone, storage, location } = await butler.prepare()

if (camera?.error) {
  // PermissionDeniedError, MediaRequirementsError, UnsupportedError, ...
}
camera?.selected // the camera open() will start
```

For the storage it says which backend the stores are kept in and asks for the protection against eviction the
configuration names; for the location it requests the permission.

It reports per section instead of throwing, leaves no device running, and is cheap when it is called again. It is
optional: `open()` does the same on demand. See [the set-up screen](../use-cases/set-up-screen.md).

## Lifetimes

Whatever holds a resource says how to release it, and also works with `using`:

| Object                                     | Release                | With `using`           |
| ------------------------------------------ | ---------------------- | ---------------------- |
| `DeviceButler`                                   | `dispose()`            | `using`                |
| camera, microphone and combined sessions   | `await close()`        | `await using`          |
| `LocationWatch`                            | `stop()`               | `using`                |
| `StorageSpaceWatch`                        | `dispose()`            | `using`                |
| the result of `on()` and `once()`          | `unsubscribe()`        | `using`                |

```ts
{
  await using session = await butler.camera.open()
  video.srcObject = session.stream
  await takePhoto(video)
} // the camera is off here, also if takePhoto() threw
```

`butler.dispose()` closes every session and stops every watch that was created through the butler. A store needs no
closing. Cameras and microphones stop at once; the other tabs get them a moment later, which is what the promise
`dispose()` returns waits for (`await butler.dispose()`, or `await using`). A butler that was disposed opens no
camera and no microphone any more.

The library brings the polyfill for `Symbol.dispose`; the syntax needs TypeScript 5.2 or a build step that knows it.
Without it, call the method of the middle column in a `finally`.

## Events

Every object with events has the same three methods:

```ts
const subscription = session.on('ended', ({ reason }) => {})
session.once('statechange', (state) => {})

subscription.unsubscribe() // or session.off('ended', listener)
```

The names and payloads are typed. A listener that throws does not stop the other listeners and does not fail the
operation that caused the event; the error goes to the logger.

Several objects only work while someone listens, because working costs: the level of a microphone is measured only
while `level.on('change')` has a listener, and the orientation is watched only while `orientation.on('change')` has
one.

## Logging

The library is silent unless it gets a logger. `ConsoleLogger` writes to the console; anything with `debug`, `info`,
`warn` and `error` works:

```ts
import type { Logger } from 'web-device-butler'

class SentryLogger implements Logger {
  debug() {}
  info() {}
  warn(message: string, ...data: unknown[]) {
    Sentry.addBreadcrumb({ message, data: { data } })
  }
  error(message: string, ...data: unknown[]) {
    Sentry.captureMessage(message, { extra: { data } })
  }
}
```

The log at `debug` level says which camera was started and why, which is the first thing to look at when a device
behaves differently than expected. The demo pages show it on the page, because a phone has no console.

## What a page needs

- **HTTPS** (or `localhost`). Without it browsers have no camera, no microphone, no location and no OPFS; the
  library answers with an `UnsupportedError` and `permission.query()` with `'unsupported'`.
- **A click.** Call `prepare()`, `open()` and `location.current()` when the user asked for something, not on page
  load: a prompt out of nowhere gets refused, and a refusal is hard to take back. The level of a microphone is not
  measured at all before the user has interacted with the page.
