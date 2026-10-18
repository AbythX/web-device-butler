# Plan: one place that decides whether a part is supported

Every part of the library answers whether the browser lets the page use it. Today most parts answer inline, with
`isSecureContext && <api> !== undefined` written out again in the part, in the request of its permission and in the
guard that throws `UnsupportedError`. Location and notifications already ask a class of their own
(`LocationSupport`, `NotificationSupport`); this plan gives every part such a class, so the part, its permission and
its guard all say the same, and a check that a browser later needs is added in one place.

```ts
export class WakeLockSupport {
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return WakeLockSupport.resolveFor(environment) !== undefined
  }

  /** the Screen Wake Lock API where the page may use it; `undefined` otherwise */
  public static resolveFor(environment: BrowserEnvironment): WakeLock | undefined {
    return environment.secured(environment.wakeLock)
  }
}
```

Implemented on the branch `refactor-feature-support`, with every decision taken as recommended. [What was built
differently](#what-was-built-differently) lists where the code left the plan. Nothing changes in the public API.

## Review: what is there today

| Finding | Where |
| ------- | ----- |
| The motion and the request of its permission disagree: the part also requires `isBrowser`, the requester does not | `motion/default-device-motion.ts:42`, `permission/requesters/motion-permission-requester.ts:23` |
| The motion repeats its check a third time in its guard | `motion/default-device-motion.ts:97` |
| `show()` of the notifications writes the check out again instead of asking `NotificationSupport` | `attention/notifications/default-device-notifications.ts:64` |
| `open()` of the screen capture writes the check out again instead of asking `isSupported` | `media/screen-capture/default-screen-capture-manager.ts:66` |
| The location checks support and then the handle again: `!this.isSupported \|\| geolocation === undefined` | `location/default-device-location.ts:180`, `geolocation-permission-requester.ts:33` |
| The clipboard and the audio output each hide a handle outside a secure context in a private getter of their own | `default-device-clipboard.ts:82`, `default-audio-output-manager.ts:145` |
| The rest check inline, each in its own words | wake lock, fullscreen, orientation lock, share, files, recording, code scanning, vibration, media access, persistent storage |

### Checked against `BrowserEnvironment`

`BrowserEnvironment.isSecureContext` is `false` only where the browser says so. None of the accessors hides an API
outside a secure context; the parts do that themselves. Which APIs the browsers restrict to a secure context:

| Part | Accessor | Secure context only | Checks it today |
| ---- | -------- | ------------------- | --------------- |
| Location | `geolocation` | yes | yes |
| Notifications | `Notification` | yes | yes |
| Camera, microphone | `mediaDevices.getUserMedia` | yes | yes |
| Screen capture | `displayMedia` | yes | yes |
| Audio output | `mediaDevices.selectAudioOutput`, `element.setSinkId` | yes | yes |
| Motion | `DeviceOrientationEvent`, `DeviceMotionEvent` | yes | yes |
| Wake lock | `wakeLock` | yes | yes |
| Share | `shareSheet` | yes | yes |
| Clipboard | `clipboard`, `ClipboardItem` | yes | yes |
| Files (save dialog) | `saveFilePicker` | yes | yes |
| Code scanning (built-in decoder) | `BarcodeDetector` | yes | **no** |
| Persistent storage, storage space | `originStorage` | yes | **no** |
| Recording | `MediaRecorder` | no | no |
| Vibration | `vibrate` | no | no |
| Fullscreen | `document.fullscreenEnabled` | no | no |
| Orientation lock | `screenOrientation.lock` | no | no |
| Files (download, open) | `isBrowser` | no | no |

## Design

### `environment.secured(api)`

A method on `BrowserEnvironment` that returns what it is given in a secure context and `undefined` outside one:

```ts
/** `api` where the page is in a secure context; `undefined` otherwise, as the browsers hide such APIs */
public secured<Api>(api: Api | undefined): Api | undefined
```

It is the shared part; the support classes are the per-part part. It replaces `isSecureContext ? x : undefined` and
`isSecureContext && x !== undefined` everywhere.

### One `XSupport` class per part

- Next to the part, named after it: `wake-lock/wake-lock-support.ts`, as `location-support.ts` today.
- Static methods only, taking the `BrowserEnvironment`, as today: `isSupportedIn(environment)`.
- Where the part needs the API itself, `resolveFor(environment)` returns it only when the part is supported. A
  further API of the same part gets `resolveXFor()`: `ClipboardSupport.resolveItemFor()`. Only the resolvers end in
  `For`; the questions keep `In`. `isSupportedIn()` is `resolveFor() !== undefined`, so the check and the handle cannot drift
  apart, and `if (!this.isSupported || geolocation === undefined)` becomes `if (geolocation === undefined)`.
- Further questions of a part get further methods: `canWriteIn()`, `canChooseIn()`.
- The part's `isSupported` / `canX`, its permission requester and its guards all ask the class. The guard keeps
  throwing its own `UnsupportedError('…')`, so the messages stay as they are.
- No base class: the methods are static. The doc comment of each class names which part and which requester ask it.

### The classes

| Class | Folder | Methods | Asked by |
| ----- | ------ | ------- | -------- |
| `LocationSupport` (exists) | `location/` | `isSupportedIn`, `resolveFor` | location, geolocation requester |
| `NotificationSupport` (exists) | `attention/notifications/` | `isSupportedIn`, `resolveFor` | notifications (`isSupported`, `show()`), notification requester |
| `VibrationSupport` | `attention/vibration/` | `isSupportedIn`, `resolveFor` | vibration |
| `MotionSupport` | `motion/` | `isSupportedIn`, `canWatchAttitudeIn`, `canWatchMovementIn`, `resolveFor` | motion (`isSupported`, guards), motion requester |
| `MediaSupport` | `media/access/` | `isSupportedIn`, `resolveFor` | media access (and through it the camera, microphone and their requester) |
| `ScreenCaptureSupport` | `media/screen-capture/` | `isSupportedIn`, `resolveFor` | screen capture (`isSupported`, `open()`) |
| `AudioOutputSupport` | `media/output/` | `canChooseIn`, `canRouteIn(environment, element)`, `resolveFor` | audio output |
| `RecordingSupport` | `media/recording/` | `isSupportedIn`, `resolveFor` | recording manager |
| `CodeScanSupport` | `media/scanning/` | `hasBuiltInDecoderIn`, `resolveFor` | code scanner (`isSupported` stays "a decoder is configured or built in") |
| `WakeLockSupport` | `screen/wake-lock/` | `isSupportedIn`, `resolveFor` | wake lock, wake lock requester |
| `FullscreenSupport` | `screen/fullscreen/` | `isSupportedIn` | fullscreen |
| `OrientationLockSupport` | `platform/` | `canLockIn`, `resolveFor` | device orientation (`canLock`, `lock()`) |
| `ShareSupport` | `sharing/share/` | `isSupportedIn`, `resolveFor` | share |
| `ClipboardSupport` | `sharing/clipboard/` | `isSupportedIn`, `canReadIn`, `canWriteIn(environment, type)`, `resolveFor`, `resolveItemFor` | clipboard, clipboard read requester |
| `FileSupport` | `files/` | `canChooseWhereToSaveIn`, `canSaveIn`, `canPickIn` | files |
| `StorageSupport` | `storage/` | `canPersistIn`, `resolveFor` | persistent storage requester, storage space reader |

Left out, because they have no support question to answer:

- **Network** and **page lifecycle**: they report `undefined` where there is no browser and never refuse.
- **Storage backends**: each driver finds out by trying (`StorageDriver.isSupported()` is async and writes a test
  entry). That is a probe, not a check, and stays in the drivers. `StorageSupport` only covers `navigator.storage`.
- **Outbox** and **permission manager**: they ask the parts above.
- **`ImageCapture`** in the camera photographer: an internal fallback, not something the application asks.

## Behaviour that changes

| Change | Who notices |
| ------ | ----------- |
| The motion requester answers `false` where there is no window (`isBrowser`), like the motion | only code that runs outside a page, such as rendering on a server |
| The built-in barcode decoder counts only in a secure context | nobody in practice: browsers do not expose `BarcodeDetector` outside one |
| Persistence and the storage space are read only in a secure context | nobody in practice: browsers do not expose `navigator.storage` outside one |

Everything else answers exactly as today.

## Steps

One commit each; every step leaves the specs green.

1. **`BrowserEnvironment.secured()`**, with a spec for secure, not secure and not stated.
2. **Location and notifications** move onto `secured()` and get their handle method; `show()` of the notifications
   and both requesters ask the class instead of checking again.
3. **`MotionSupport`**: the motion and its requester ask the same class, which fixes the disagreement; the guard
   `assertSupported` asks `canWatchAttitudeIn` / `canWatchMovementIn`.
4. **`MediaSupport`** for media access.
5. **`ScreenCaptureSupport`**; `open()` no longer checks on its own.
6. **`AudioOutputSupport`**; the private `mediaDevices` getter goes.
7. **`WakeLockSupport`**; the wake lock requester asks it instead of the wake lock.
8. **`ShareSupport`** and **`ClipboardSupport`**; the private `clipboard` getter goes, the clipboard read requester
   asks `canReadIn`.
9. **`FileSupport`**.
10. **`StorageSupport`** for the persistent storage requester and the storage space reader.
11. **`RecordingSupport`**, **`CodeScanSupport`**, **`VibrationSupport`**, **`FullscreenSupport`**,
    **`OrientationLockSupport`**: the parts without a secure context check.
12. **A spec that the part and its requester agree**: for each part with a requester, `part.isSupported` equals
    `requester.isSupported` over the same environments (secure or not, API there or not).

Each class gets a spec with `BrowserEnvironment.of({ … })`: not secure, API missing, API there. The specs of the
parts stay as they are and prove that nothing else changed.

## Decisions

| Decision | Recommendation |
| -------- | -------------- |
| Add the secure context check to parts whose API also works without one (recording, vibration, fullscreen, orientation lock, downloading and opening files)? | **No.** Their classes check only the API; it would make them stop working on pages served over plain HTTP that work today. The class is the place to add it later. |
| A handle method (`resolveFor`) next to `isSupportedIn`, or only the boolean? | **Both**, so the guard and the check are one decision and the double checks go. |
| Names: `XSupport` with `isSupportedIn` / `canXIn` / `resolveFor` | `resolveFor()` for the main API and `resolveXFor()` for any further one, so adding a resolver never renames one; `In` for the questions. Decided in review. |
| Folder of `OrientationLockSupport`: `platform/` next to the orientation, or a new `platform/orientation/` with the orientation moved in | **`platform/`**, no move in this change. |

## What was built differently

| Plan | Built | Why |
| ---- | ----- | --- |
| The wake lock requester asks `WakeLockSupport` | It still asks the wake lock, whose `isSupported` asks `WakeLockSupport` | The requester is built from the wake lock, not from the environment; both already say the same, and changing its constructor would only move the wiring |
| `FileSupport.canOpenIn` | `FileSupport.canPickIn` | named after the call it answers for, `pick()` |
| `StorageSupport.canEstimateIn` | left out; `resolveFor` hands out `navigator.storage` | the space reader catches a missing estimate and still reports the persistence; a check in front of it would have lost that |
| Step 12 for every part with a requester | for the location, the notifications and the motion | the camera, the microphone and the wake lock requesters ask their part directly, so they cannot disagree; the clipboard requester answers a narrower question (reading) than `clipboard.isSupported` |
