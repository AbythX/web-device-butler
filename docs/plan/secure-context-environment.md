# Plan: a type of its own for the secure context

An API that the browsers only offer to a page loaded over HTTPS should not be reachable from library code without
going through the secure context. Today every such API is a getter of `BrowserEnvironment`, and only convention (the
support classes of [`feature-support.md`](feature-support.md)) makes the code ask `secureContext?.` first. With a
type of its own, forgetting it is a compile error:

```ts
environment.wakeLock // does not compile: `wakeLock` is not on BrowserEnvironment
environment.secureContext?.wakeLock // SecureBrowserEnvironment | undefined
```

This protects the library from itself. It cannot protect an application: whether a page runs in a secure context is
only known at runtime, and the same bundle can be served over HTTPS and over HTTP. For an application,
`isSupported`, `UnsupportedError` and `prepare()` stay the way to find out.

Not implemented yet. This is the inventory to decide on first.

## How the APIs were checked

Against the Web IDL of each specification, from the machine-readable copies in
[`w3c/webref`](https://github.com/w3c/webref/tree/main/ed/idl) (editor's drafts, read on 2026-10-18). An API marked
`[SecureContext]` does not exist on a page outside a secure context. Where the IDL exposes an API everywhere, the
prose of the specification was read for what it does outside a secure context.

## Inventory

### Hidden outside a secure context: move to `SecureBrowserEnvironment`

| Accessor | What it reads | Where the specification says so |
| -------- | ------------- | ------------------------------- |
| `locks` | `navigator.locks` | Web Locks: `[SecureContext] interface mixin NavigatorLocks` |
| `originStorage` | `navigator.storage` | Storage: `[SecureContext] interface mixin NavigatorStorage` |
| `mediaDevices` | `navigator.mediaDevices` | Media Capture and Streams: `[SameObject, SecureContext] readonly attribute MediaDevices mediaDevices` |
| `displayMedia` | `navigator.mediaDevices.getDisplayMedia` | Screen Capture: a member of `MediaDevices`, which is `[SecureContext]` |
| `CaptureController` | `CaptureController` | Screen Capture: `[Exposed=Window, SecureContext] interface CaptureController` |
| `serviceWorker` | `navigator.serviceWorker` | Service Workers: `[SecureContext, SameObject] readonly attribute ServiceWorkerContainer serviceWorker` |
| `DeviceOrientationEvent` | `DeviceOrientationEvent` | Device Orientation: `[Exposed=Window, SecureContext] interface DeviceOrientationEvent` |
| `DeviceMotionEvent` | `DeviceMotionEvent` | Device Orientation: `[Exposed=Window, SecureContext] interface DeviceMotionEvent` |
| `BarcodeDetector` | `BarcodeDetector` | Shape Detection: `[Exposed=(Window,Worker), SecureContext] interface BarcodeDetector` |
| `wakeLock` | `navigator.wakeLock` | Screen Wake Lock: `[SecureContext] partial interface Navigator { … wakeLock }` |
| `shareSheet` | `navigator.share` | Web Share: `[SecureContext] Promise<undefined> share(…)` |
| `clipboard` | `navigator.clipboard` | Clipboard: `[SecureContext, SameObject] readonly attribute Clipboard clipboard` |
| `ClipboardItem` | `ClipboardItem` | Clipboard: `[SecureContext, Exposed=Window] interface ClipboardItem` |
| `ImageCapture` | `ImageCapture` | Image Capture: `[Exposed=Window, SecureContext] interface ImageCapture` |
| `saveFilePicker` | `showSaveFilePicker` | File System Access: `[SecureContext] partial interface Window { … showSaveFilePicker }` |

### There, but refusing outside a secure context: move as well

| Accessor | What it reads | What the specification says |
| -------- | ------------- | --------------------------- |
| `geolocation` | `navigator.geolocation` | Exposed everywhere, but "request a position" fails with `PERMISSION_DENIED` in a non-secure context |
| `Notification` | `Notification` | Exposed everywhere, but notifications are a powerful feature, and the Permissions specification returns `denied` for every powerful feature in a non-secure context |

Moving them matches what the library already does: `LocationSupport` and `NotificationSupport` treat both as missing
outside a secure context.

### Works in any context: stays on `BrowserEnvironment`

| Accessor | What it reads | Note |
| -------- | ------------- | ---- |
| `isBrowser`, `window`, `navigator`, `document` | the page | |
| `openBroadcastChannel` | `BroadcastChannel` | HTML, no `[SecureContext]` |
| `localStorage`, `sessionStorage` | Web Storage | HTML, no `[SecureContext]` |
| `indexedDB`, `keyRange` | IndexedDB | no `[SecureContext]` |
| `vibrate` | `navigator.vibrate` | no `[SecureContext]` |
| `screenAngle`, `screenOrientation` | `screen.orientation` | no `[SecureContext]`, `lock()` included |
| `createImageBitmap` | `createImageBitmap` | HTML, no `[SecureContext]` |
| `hasUserActivation` | `navigator.userActivation` | HTML, no `[SecureContext]` |
| `permissions` | `navigator.permissions` | Exposed and working everywhere; it answers `denied` for every powerful feature outside a secure context. See the decisions. |
| `isOnline` | `navigator.onLine` | HTML, no `[SecureContext]` |
| `connection` | `navigator.connection` | Network Information, no `[SecureContext]` |
| `MediaRecorder` | `MediaRecorder` | no `[SecureContext]` |
| `createBlob`, `createObjectUrl`, `revokeObjectUrl` | `Blob`, `URL` | File API, no `[SecureContext]` |
| `hasAudioContext`, `createAudioContext` | `AudioContext` | Web Audio, no `[SecureContext]` |
| `createMediaStream` | `MediaStream` | no `[SecureContext]`; a stream of a camera only comes from the secure `mediaDevices` anyway |
| `isSecureContext`, `secureContext` | | the switch itself |

Two calls the library uses are `[SecureContext]` but are not accessors of the environment, so they stay where they
are: `HTMLMediaElement.setSinkId` (already checked by `AudioOutputSupport.canRouteIn`) and the origin private file
system (`StorageManager.getDirectory`, which comes with `originStorage`).

## What moves with them

The support classes already read through `secureContext?.`; they only change the type they get. These places read a
moving accessor directly and have to go through `secureContext?.`:

| Where | Reads | Today outside a secure context | After the move |
| ----- | ----- | ------------------------------ | -------------- |
| `core/coordination/lock/cross-tab-lock.ts:50,124` | `locks` | the browser hides `navigator.locks`; the lock falls back to locks inside this tab and warns | the same, through `secureContext?.locks`. No decision needed: the fallback exists. |
| `attention/notifications/default-device-notifications.ts:139,143,167` | `serviceWorker` | hidden by the browser: the notifications do not listen to a worker, and `show()` refuses before it looks for one | the same, through `secureContext?.serviceWorker` |
| `media/screen-capture/default-screen-capture-manager.ts:119` | `CaptureController` | only reached after `ScreenCaptureSupport` let `open()` go on | the same; the capture can keep the secure environment it resolved |
| `media/camera/photo/camera-photographer.ts:27` | `ImageCapture` | only reached with the stream of a running camera, which needs a secure context | the same, through `secureContext?.ImageCapture` |
| `storage/drivers/opfs/opfs-storage-driver.ts:221` | `originStorage` | hidden by the browser; the driver reports that it is not available | the same, through `secureContext?.originStorage` |

None of them changes what it does on a real browser: each one relied on the browser hiding the API, and now says so.
Fake environments in the specs that set `isSecureContext: false` and still provide such an API would now see it
missing, which is what a browser does.

The specs of `BrowserEnvironment` that read a moving accessor (`#mediaDevices`, `#geolocation`, …) move to a spec of
`SecureBrowserEnvironment`.

## Design

```ts
export class BrowserEnvironment {
  /** @internal */
  public get secureContext(): SecureBrowserEnvironment | undefined
  // only what works in any context
}

/** @internal: the same globals, with the APIs of a secure context */
export class SecureBrowserEnvironment extends BrowserEnvironment {
  public get wakeLock(): WakeLock | undefined
  // … the 17 accessors above
}
```

- `secureContext` returns a `SecureBrowserEnvironment` over the same `resolveGlobals`, created once per environment,
  instead of `this`. `resolveGlobals` becomes `protected`.
- `BrowserEnvironment.of({ … })` and `BrowserGlobals` stay as they are, so specs and custom setups keep working.
- `SecureBrowserEnvironment` is not exported from an entry point and is reached only through the internal
  `secureContext`.

## Decisions

| Decision | Recommendation |
| -------- | -------------- |
| Move `geolocation` and `Notification`, which are there but refuse? | **Yes.** They cannot work outside a secure context, and the library already treats them as missing there. |
| Move `permissions`? | **No.** It works everywhere and answers `denied` outside a secure context, which is the right answer. The permission manager returns `unsupported` before asking anyway, through the support classes. |
| The 17 getters leave the public type of `BrowserEnvironment`: a breaking change of the published types | **Accept it.** The package is at `0.0.0`, and an application has no reason to read them; the parts are its API. |
| `secureContext` as a separate object or as `this` with a narrower type | **A separate object.** `this` with a cast would keep the secure getters on every `BrowserEnvironment` at runtime and only hide them in the types. |

## Steps

1. `SecureBrowserEnvironment` with the 17 accessors moved from `BrowserEnvironment`; `secureContext` returns it; the
   specs of the accessors move with them.
2. The support classes take the narrower type; nothing else changes in them.
3. The five places of [What moves with them](#what-moves-with-them) read through `secureContext?.`.
4. The specs and the fakes that relied on a moving accessor of `BrowserEnvironment`.
