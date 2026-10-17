# Plan: screen capture, code scanning, motion, notifications, recordings that survive the page

Five parts that fit what the library is for: an application says what it needs, and the library deals with how each
browser provides it.

| #   | Part                                                  | Reached through          | Size   |
| --- | ----------------------------------------------------- | ------------------------ | ------ |
| 1   | [Screen capture](#1-screen-capture)                   | `butler.screenCapture`   | medium |
| 2   | [Recordings that survive the page](#2-recordings-that-survive-the-page) | `butler.recorder` | medium |
| 3   | [Scanning codes](#3-scanning-codes)                   | `butler.scanner`         | medium |
| 4   | [Motion and heading](#4-motion-and-heading)           | `butler.motion`          | medium |
| 5   | [Notifications and vibration](#5-notifications-and-vibration) | `butler.notifications`, `butler.vibration` | medium |

Every decision is taken as recommended; the tables of each part keep the options that were weighed.

They are independent. The order is a recommendation: 1 reuses the most of what is there, 2 makes the long recordings
of 1 safe, 3 is the most visible gain for the camera. Each part is a branch of its own off `develop` and a pull
request to `develop`.

What is weaker or out of scope for now is on the list in [`later.md`](later.md).

Every part brings the same set of pieces, which the steps below do not repeat each time:

- an interface and a `Default...` class, reached from `DeviceButler`, created by `DefaultDeviceButler.create()`
  without touching the browser
- an entry point in `package.json` `exports` where the part is a folder of its own
- the bindings of the inversify adapter, a hook for Vue and one for React
- fakes in a `testing` folder, specs against the fakes, a `*.browser.spec.ts` for Chromium and Firefox
- a guide or a section of one, a section in the README tour, the errors in `docs/guides/errors.md`
- a demo page, and questions for the [device matrix](../device-matrix/README.md)

## 1. Screen capture

Implemented on the branch `screen-capture`. [What was built differently](#what-was-built-differently) lists where the
code left the plan.

### What is there today

- Sessions (`MediaSession`, `BaseMediaSession`) hold one stream, report `live`, `muted`, `ended` and end with a
  reason. `device` already covers "the browser or the user stopped it", which is what the "stop sharing" button of
  the browser does.
- The recorder takes any `RecordingSource`: a stream, a state, `allowTakeover` and the events `statechange` and
  `ended`. A screen session fits it without a change.
- `CombinedMediaSession` joins a camera and a microphone into one stream for the recorder. Nothing joins a screen
  and a microphone.
- `src/core/testing/in-answer-to-a-click.ts` is there for calls that need a click of the user.
- `getDisplayMedia` is not used anywhere. `FakeMediaDevices` has `getUserMedia` and `enumerateDevices` only.

### Proposed

```ts
await using screen = await butler.screenCapture.open({
  prefer: { surface: 'window', audio: true, frameRate: 30, content: 'text' },
})

video.srcObject = screen.stream
screen.surface // 'monitor' | 'window' | 'browser' | undefined: what the user chose
screen.audio // MediaStreamTrack | undefined: whether the user shared the sound

screen.on('ended', ({ reason }) => {
  /* 'closed' | 'device': the user pressed "stop sharing" */
})

// a screen with the voice of the user, for a tutorial
await using microphone = await butler.microphone.open()
const recording = await butler.recorder.record(butler.media.join(screen, microphone))
```

- `ScreenCaptureManager` has `isSupported` and `open(requirements)`. It is not a `MediaInputManager`: there is
  nothing to list and nothing to select, the browser shows its own picker.
- `ScreenCaptureRequirements` take `require` and `prefer` like the camera:
  - traits: `surface`, `audio`, `width`, `height`, `frameRate`, `cursor`
  - options that are no trait: `content: 'text' | 'motion'` (sets `contentHint` on the track, so the encoder keeps
    text sharp or motion smooth), `excludeThisTab` (`selfBrowserSurface: 'exclude'`), `focus: 'keep-page' |
    'captured'` (`CaptureController.setFocusBehavior()` where the browser has it)
  - `prefer` goes to the browser as hints (`displaySurface`, `systemAudio`, `preferCurrentTab`, constraints)
- `ScreenCaptureSession extends MediaSession` adds `surface`, `audio`, `settings` and `configure()` like the camera.
- `butler.media.join(...sessions)` returns a `RecordingSource` with the tracks of all of them in one stream that
  stays the same object. It ends when the first of them ends. `CombinedMediaSession` stays as it is.

### Decisions

| Question | Options | Recommended |
| -------- | ------- | ----------- |
| What happens to `require` that the browser cannot promise in advance, for example `require: { audio: true }` when the user shares a window without sound? | a) check after the picker: stop the capture and reject with a `MediaRequirementsError` that says what was missing; b) treat `require` like `prefer` for the screen | a), the same meaning as for the camera. The guide says the user sees the picker once more if the application asks again. |
| Does a screen capture hold a lock across tabs? | a) no, every tab can capture; b) like the camera, `whenBusy` | a), the system lets several captures run, and there is nothing to fight over |
| A permission `display-capture` in `DevicePermissionName`? | a) no; b) yes | a), browsers ask every time and remember nothing, so a permission screen has nothing to show |
| Where is the code? | a) `src/media/screen-capture/`; b) `src/screen/capture/` | a), it is a media session, and `src/screen/` is about the screen of the device (wake lock, fullscreen) |
| `media.join()` in this part or later? | a) now; b) later | a), recording a screen with a voice is the main use, and without it the application has to join the tracks by hand |

### Errors

- `UnsupportedError` where the browser has no `getDisplayMedia`, which includes the browsers on phones
- `PermissionDeniedError` when the user cancels the picker or the system forbids recording the screen
- `MediaError` with the cause when `open()` is not called in answer to a click (`InvalidStateError` in Chromium,
  `NotAllowedError` elsewhere; the library tells the two apart where it can, and the guide says to call it from a
  click handler)

### Steps

1. `getDisplayMedia` in `BrowserEnvironment` and in `FakeMediaDevices`, with a fake picker that the specs choose for
2. `ScreenCaptureRequirements`, the mapping to the options and constraints of the browser, with specs per browser
   difference that is known (what Firefox and Safari do not have is left out, not sent)
3. `ScreenCaptureSession` on `BaseMediaSession`; `ended` with `device` when the track ends
4. checking `require` after the picker
5. `ScreenCaptureManager`, `butler.screenCapture`
6. `butler.media.join()`, recording a joined source in the specs of the recorder, including a track that ends
7. browser specs: Chromium with `--auto-select-desktop-capture-source` and `--use-fake-ui-for-media-stream`; Firefox
   with the preferences that skip the picker (to be found out; if there are none, Firefox runs against the fakes
   only and the device matrix says so)
8. hooks, bindings, a section on the `screen/` demo page, a guide `docs/guides/screen-capture.md`, a use case
   "a tutorial: the screen with a voice"

### Questions for the device matrix

- Which browsers share the sound of a tab, of a window, of the whole screen?
- Does the "stop sharing" button end the track in every browser, or only mute it?
- Does `contentHint` change what is recorded, visibly?

### What was built differently

- `ScreenCaptureManager` also has `configuration` and `configure()`, with a `screenCapture` section in the
  configuration, like the camera; and `dispose()`, which `butler.dispose()` calls to stop every capture.
- `BaseMediaSession` holds its device through a `MediaSessionHold` instead of a `MediaLease`. A `MediaLease` is one;
  the screen session holds its stream with a `StreamHold`, which stops the tracks and has no lock. The kind of a
  session is a `MediaSourceKind`: the camera, the microphone or the screen. The track of a session is the picture
  where the stream has one, because Chromium can list the sound of a capture first.
- `media.join()` returns a `JoinedMediaSource` that does not own its sessions: it ends with the first of them, and
  leaves the others running. `dispose()` ends it with `closed`.
- `open()` tells a missing click from a refusal: `InvalidStateError` and `InvalidAccessError`, and a
  `NotAllowedError` while `navigator.userActivation` says the user did not just click, become a `MediaError` that
  says so. A cancelled picker is a `PermissionDeniedError` for `display-capture`, without an entry in
  `DevicePermissionName`.
- Firefox needs no further preferences: with `media.navigator.permission.disabled` it shares the whole screen in
  answer to a click, without a picker. It does not report `displaySurface` and `cursor`, so a `require` of them
  cannot fail there. The WebKit build of Playwright has no `getDisplayMedia`.
- The hooks of Vue and React share `useMediaSession`, which now takes anything that opens sessions
  (`MediaSessionOpener`). The React spec of `useScreenCapture` runs against the fake devices, because a real picker
  cannot be answered from a spec.
- The demo is a section of the `screen/` page, the use case is
  [`screen-tutorial.md`](../use-cases/screen-tutorial.md).

## 2. Recordings that survive the page

Implemented on the branch `kept-recordings`. [What was built differently](#what-was-built-differently-1) lists where
the code left the plan.

### What is there today

- `RecordingOptions.into` writes a recording into a stream, for example `store.writeStream(key)`, and the
  recording has the browser hand over its data whenever the page is hidden or frozen.
- But what is written into a stream is not kept until the stream is closed:
  - OPFS: `FileSystemWritableFileStream` writes into a temporary file and replaces the real one on `close()`
    (`src/storage/drivers/opfs/opfs-storage-driver.ts`, `openWriteStream()`). A page that is thrown away while it
    records leaves nothing.
  - the memory driver and the IndexedDB driver collect the chunks and write them on `close()` as well
  - `media-recording.ts` says "what a stream that was never closed keeps of it is up to where it writes", which is
    true but hides that with the drivers of the library the answer is "nothing".
- So a long recording on a phone, where the page is thrown away in the background without another word, is lost as
  a whole. The voice memo and the video message use cases have this gap.

### Proposed

```ts
const recording = await butler.recorder.record(microphone, { keep: { namespace: 'memos' } })
// the page is thrown away after ten minutes

// on the next visit
for (const kept of await butler.recorder.kept('memos').list()) {
  kept.state // 'finished' | 'interrupted'
  const { blob, duration } = await kept.read()
  await kept.delete()
}
```

- `keep` writes every piece the recorder hands over as an entry of its own, in a store of the library, next to a
  small description of the recording: format, start, duration so far, segments, how many pieces each. Each piece is
  written when it arrives, so at most one `interval` (default 1 s) is lost.
- `stop()` returns the result as before and marks the recording `finished`; whether it is also removed from the
  store is an option (`keep: { namespace, after: 'remove' | 'keep' }`, default `remove` once `finished` has
  resolved).
- `recorder.kept(namespace)` lists what is kept. A recording is `interrupted` when its description says it was not
  stopped and no tab records it any more: while it records, the tab holds a Web Lock named after the recording, so a
  recording that runs in another tab is never listed as interrupted.
- `read()` puts the pieces of each segment together. For WebM it writes the duration from the description into the
  file (`WebmDuration`), which a recording that never stopped does not have.
- When the storage is full, the recording stops and keeps what it has, and `finished` rejects with a
  `StorageQuotaError` that says so, instead of failing on every following piece.

### Decisions

| Question | Options | Recommended |
| -------- | ------- | ----------- |
| Which backend? | a) IndexedDB by default, `keep.storage` takes `StorageRequirements`; b) OPFS with one file per piece | a), it writes each entry at once and is consistent across tabs; with `require: { persistence: 'origin' }` it asks for protection against eviction like any store |
| `into` and `keep` together? | a) no, one or the other; b) both | a), two places for the same data invite two truths |
| What does the guide say about `into` and OPFS? | — | say plainly that a stream keeps nothing until it is closed, and point to `keep` for recordings that must survive the page |

### Steps

1. a spec that shows the gap: a recording into a store whose page is thrown away keeps nothing
2. the description of a kept recording and writing pieces as entries, against the memory driver
3. the lock per recording, `interrupted` against a recording of a second tab (`src/core/testing/second-tab.ts`)
4. `recorder.kept()`, `list()`, `read()` with segments and the WebM duration, `delete()`
5. a full storage
6. the voice memo and video message use cases and their demos use `keep`; the recording guide gets a section
7. browser spec: record, reload the page in the middle, find the recording `interrupted` and play it

### Questions for the device matrix

- Is the MP4 that Safari writes playable when it is cut off after a piece, or does it need the end that `stop()`
  writes? (Chromium writes fragmented MP4, which is.)
- How much of the last second is lost when Safari on iOS throws a page away in the background?

### What was built differently

- `list()` also returns the recordings a tab records right now, as `recording`, and `KeptRecordings` has `get(id)`.
  `MediaRecording` has an `id`, the name the recording is kept under.
- `discard()` removes a kept recording as a whole, not only the segment that is being written: the earlier segments
  are the library's own entries, not streams of the application.
- `finished` and `read()` put the recording together as a `Blob`. The pieces are not held in memory while it
  records.
- A namespace has two stores, the descriptions as JSON and the pieces as bytes, in the same backend. `read()` also
  takes a piece that was written after the last description, for a page that went away in between.
- After a piece that could not be written, no further piece is written, so a full storage leaves no hole in the
  file. A recording that failed before anything was written leaves nothing behind.
- `record()` refuses an `id` that another tab records right now with a `MediaError`, and `delete()` refuses one that
  runs.
- `kept(namespace, storage)` takes the backend as well; what a namespace is opened with the first time on a page is
  what it keeps.
- `DefaultMediaRecordingManager` takes the storage and the lock of the butler; on its own it creates a storage
  when the first recording is kept.
- The browser spec records in a second tab and closes it instead of reloading the page, which looks the same to the
  other tabs. Chromium frees the locks of a closed tab a moment later, so the spec waits for it. An interrupted MP4
  of Chromium and an interrupted WebM of Firefox both played.

## 3. Scanning codes

Implemented on the branch `code-scanner`. [What was built differently](#what-was-built-differently-2) lists where
the code left the plan.

### What is there today

- `CameraPhotographer` draws the picture of a stream on a `<video>` that is never added to the page. The scanner
  needs the same, once per frame it looks at.
- `FrameLoop` in the fabric adapter calls a task once per frame, limited to a frame rate.
- `PageLifecycle` says when the page is hidden, which is when scanning should pause.
- Focus and torch are controls of the camera session; a scanner wants both.
- Nothing decodes codes. `BarcodeDetector` exists in Chromium on Android, macOS and ChromeOS, not on Windows and
  Linux, not in Firefox, not in Safari.

### Proposed

```ts
await using camera = await butler.camera.open({ require: { facing: 'back' }, prefer: { focus: true } })
await using scan = butler.scanner.scan(camera, { formats: ['qr_code', 'ean_13'] })

scan.on('code', ({ format, value, corners }) => show(value))
const first = await scan.next() // or wait for one code

// a code in a picture the user chose
const codes = await butler.scanner.detect(await butler.files.open({ accept: 'image/*' }))
```

- `CodeScanner` (`butler.scanner`): `isSupported`, `formats()` (what the decoder can read), `scan(source,
  options)`, `detect(image)`.
- `CodeScan` is a `Listenable` with `code` and `ended`, `next()`, `pause()`, `resume()`, and `AsyncDisposable`. It
  ends with its camera session.
- Options: `formats`, `rate` (frames per second that are looked at; default 10), `region` (the part of the picture
  to look at, as fractions, for a frame in the middle of the screen), `repeatAfter` (how long the same code is not
  reported again; default 2 s), `decoder`.
- Codes: `format`, `value`, `corners` in the pixels of the picture, so an overlay can draw them.
- Scanning pauses while the page is hidden and while the session is `muted`.
- A decoder is an interface: `{ formats: readonly CodeFormat[]; decode(image: ImageBitmap): Promise<DetectedCode[]> }`.
  The core brings one for `BarcodeDetector`. Where the browser has none, `isSupported` is `false` unless the
  application passes a decoder.

### Decisions

| Question | Options | Recommended |
| -------- | ------- | ----------- |
| A decoder for browsers without `BarcodeDetector`? | a) an optional entry point `web-device-butler/zxing` on `zxing-wasm` as an optional peer dependency, like fabric; b) only the interface, and the guide shows how to wrap a library; c) a decoder of our own | a), otherwise most desktop browsers and every iPhone cannot scan, and the core stays without runtime dependencies. The WASM file is loaded from where the application says. |
| How are frames taken? | a) the hidden `<video>` and `createImageBitmap`, with `requestVideoFrameCallback` where it exists; b) `MediaStreamTrackProcessor` where it exists, a) elsewhere | a) first; b) only if the device matrix shows that a) is too slow on phones |
| Where does the decoding run? | a) on the page; b) in a worker | a) for `BarcodeDetector`, which is fast; the zxing entry point decides for itself and may use a worker |
| `scan()` on the session or on a manager? | a) `butler.scanner.scan(session)`, like `recorder.record(session)`; b) `session.scan()` | a), one way for every source, and the camera session does not grow |

### Steps

1. the decoder interface, `DetectedCode`, `CodeFormat`; a fake decoder and a fake `BarcodeDetector`
2. taking frames from a stream at a rate, with a region, paused while hidden or muted; shared with
   `CameraPhotographer` where it can be
3. `CodeScan`: reporting, `repeatAfter`, `next()`, ending with the session
4. `detect()` for a `Blob`, an `ImageBitmap`, a canvas
5. the `BarcodeDetector` decoder
6. the zxing entry point with its own browser spec, which also gives the browser specs of the core a real decoder on
   Windows and Linux
7. hooks, bindings, a use case "scan a code" with a demo, the document scanner links to it

### Questions for the device matrix

- How many frames per second does a phone decode with `BarcodeDetector`, and with zxing?
- Does continuous focus keep a code sharp at a short distance, or does the scanner have to focus on the region?

### What was built differently

- A decoder gets `ImageData`, the one shape both the code detector of the browser and zxing-wasm take. The scanner
  draws the region of each picture onto a canvas and reads its pixels back.
- The pictures are taken on a timer at `rate`, measured from when the last one began, not with
  `requestVideoFrameCallback`: one way for every browser, and a slow decoder lowers the rate by itself.
- `repeatAfter` counts from when a code was last in sight, so a code that is held in front of the camera is reported
  once, however long it is held.
- `ZxingCodeDecoder` takes `wasmUrl` and has no default, so it never loads its file from a server the application
  did not choose. zxing-wasm 3.1.4 is used: 3.1.5 is younger than the `minimumReleaseAge` of the workspace.
- `isSupported` is `true` where the browser has a code detector, also one that reads nothing; `formats()` tells.
- The browser spec draws codes with the writer of zxing-wasm and reads them from files, from regions of a canvas
  and from the stream of a canvas. zxing-wasm reads in Chromium, Firefox and WebKit. The code detector of the
  browser is only tested against a fake, because the browsers of the specs have none.
- `useCodeScan` for Vue and React holds the scan and the last code. The document scanner links to the code scanner
  instead of reading codes itself.

## 4. Motion and heading

Implemented on the branch `device-motion`. [What was built differently](#what-was-built-differently-3) lists where
the code left the plan.

### What is there today

- `butler.orientation` knows `portrait` and `landscape` and can lock the screen; it follows the shape of the page,
  not the sensors.
- `screen-orientation-like.ts` gives the angle of the screen, which turning the values of the sensors into the
  frame of the screen needs.
- `LocationWatch` is the model for a watch: started, emits, disposed.
- `PermissionRequester` is the model for a permission that is only requested by using the feature.

### Proposed

```ts
await butler.permission.request('motion') // in a click: Safari on iOS asks only then

using tilt = butler.motion.watchAttitude({ rate: 30 })
tilt.on('change', ({ pitch, roll, heading }) => level.draw(pitch, roll))

using shake = butler.motion.watchMotion()
shake.on('change', ({ acceleration, rotationRate }) => {})
```

- `DeviceMotion` (`butler.motion`): `isSupported`, `watchAttitude()`, `watchMotion()`.
- Attitude: `pitch`, `roll` relative to the screen as it is held, and `heading` in degrees from north, `undefined`
  where the device cannot tell. The library takes it from `webkitCompassHeading` in Safari, from
  `deviceorientationabsolute` in Chromium, and corrects it by the angle of the screen.
- Motion: `acceleration`, `accelerationIncludingGravity`, `rotationRate`, in the frame of the screen.
- `rate` limits the events, which arrive at the rate of the device otherwise.
- A watch reports `unavailable` when the first events carry no values or none arrive within a second, which is what
  a desktop does, instead of staying silent.
- `motion` joins `DevicePermissionName`, with a requester that calls `DeviceMotionEvent.requestPermission()` and
  `DeviceOrientationEvent.requestPermission()` where they exist and answers `granted` where the browser does not ask.
- `butler.prepare({ motion: true })` requests it, like the location.

### Decisions

| Question | Options | Recommended |
| -------- | ------- | ----------- |
| A part of its own, or more on `butler.orientation`? | a) `butler.motion`; b) `butler.orientation.attitude` | a), `orientation` is about the shape of the page; mixing in the sensors makes both harder to explain |
| Raw events, or the Generic Sensor API where it exists (Chromium)? | a) the events everywhere; b) sensors where they exist | a), one source of values everywhere; b) only if the device matrix shows a reason |
| Pitch and roll, or the browser's `alpha`, `beta`, `gamma`? | a) pitch, roll, heading; b) the browser's angles; c) both | a) with the browser's angles as `raw`, so nobody has to learn Euler angles for a spirit level, and nothing is hidden from who needs it |

### Steps

1. the window events in `BrowserEnvironment`; fakes that emit them, with and without values
2. the permission requester and `motion` in `DevicePermissionName`; `prepare({ motion })`
3. `watchMotion()` with `rate` and `unavailable`
4. `watchAttitude()`: pitch and roll in the frame of the screen, the heading per browser, specs per angle of the
   screen
5. browser specs with dispatched events (the sensors of the browsers cannot be faked from the specs)
6. hooks, bindings, a section in the location, orientation and permissions guide, a compass on the `location/` demo
   page, the route use case shows the direction

### Questions for the device matrix

- Is `webkitCompassHeading` still there in Safari on iOS, and does `deviceorientationabsolute` give the heading in
  Chromium on Android?
- Which way do the values point when the phone is held in landscape?

### What was built differently

- `roll` is how far the right edge of the screen is below the horizon, and `pitch` the turn around the axis of the
  screen from left to right, both read from the rotation of the device; neither is an angle of the browser turned
  by the screen. A spirit level shows them as they are. While the device is pitched, `roll` is smaller than `gamma`,
  which the real-browser spec showed.
- The heading follows the top edge of the screen while the device lies more flat than upright, and its back while
  it is upright; the formula of the specification only covers the back and fails for a flat device.
- A watch reads `deviceorientationabsolute` and `deviceorientation` and keeps to the absolute one once it has
  arrived. It has `isAvailable` next to the event `unavailable`, which comes at once for an event without values
  and after a second without events. A rate keeps the last value: it is reported once the rate allows.
- The events are read field by field (`SensorReadings`), because the browsers fill different fields.
- `request('motion')` asks both sensors in one click in Safari. `query()` says `prompt` there until the user
  answered on this visit; in Chromium it reads `accelerometer` and `gyroscope` from the Permissions API, and a
  browser that does not know them as permissions, as Firefox, is taken as one that does not ask.
- The hooks are `useAttitude` and `useMovement`, on a shared `useMotionWatch`. The real-browser spec dispatches the
  events of the browser, which Chromium and Firefox can create and WebKit cannot.

## 5. Notifications and vibration

### What is there today

- Nothing shows a notification and nothing vibrates.
- `TabCoordination`, `CrossTabChannel` and `PageLifecycle` give what is needed to know whether any tab of the
  application can be seen.
- Correction to the first look at this: a notification with the same `tag` replaces the one before in every browser,
  so three tabs do not show three notifications. What the library can add across tabs is the decision whether to
  show one at all.

### Proposed

```ts
await butler.permission.request('notifications') // in a click

await butler.notifications.show({
  title: 'Report sent',
  body: 'The field report from 10:42 has arrived.',
  tag: 'outbox',
  when: 'unseen', // only if no tab of this application can be seen
})

butler.vibration.vibrate('short')
```

- `DeviceNotifications` (`butler.notifications`): `isSupported`, `show(options)`, events `click` and `close` for the
  notifications this page showed.
- `show()` uses the registration of the service worker of the application where there is one, and `new
  Notification()` where there is none. Chromium on Android only allows the first, and throws on the second; the
  application does not need to know.
- `when: 'always' | 'unseen' | 'hidden'`: `unseen` asks the other tabs over the channel whether one of them can be
  seen, `hidden` only looks at this tab. Default: `always`.
- `notifications` joins `DevicePermissionName`.
- `DeviceVibration` (`butler.vibration`): `isSupported`, `vibrate(pattern)` with a few named patterns and raw
  milliseconds, `stop()`. It returns whether the browser took it. Safari has no vibration; there it does nothing and
  `isSupported` is `false`.

### Decisions

| Question | Options | Recommended |
| -------- | ------- | ----------- |
| Clicks on a notification that the service worker showed only reach the worker | a) an entry point `web-device-butler/worker` with a function for the `notificationclick` of the worker that focuses a tab and tells the page; b) nothing, the guide explains it; c) the library registers a worker of its own | a); c) would take the worker away from the application |
| Push messages? | a) out of scope; b) in | a), they need a server and keys, not the device |
| Where is the code? | a) `src/attention/notifications/`, `src/attention/vibration/`; b) two top-level folders | a), like `sharing/clipboard` and `sharing/share` |
| Notifications in Safari on iOS only work in a web app that was added to the home screen | — | `isSupported` is `false` in the browser itself, and the guide says so |

### Steps

1. `Notification`, the service worker registration and `navigator.vibrate` in `BrowserEnvironment`; fakes
2. the permission requester, `notifications` in `DevicePermissionName`
3. `show()` with both ways and the choice between them, specs for a worker that is never ready (with a time limit)
4. `when`: the question over the channel, with a second tab that can be seen and one that cannot
5. the worker entry point and the click
6. `DeviceVibration`
7. browser specs: Chromium and Firefox grant notifications through the context of the spec; vibration is checked
   against the fakes only
8. hooks, bindings, a guide section, the field report use case notifies when the outbox has sent its report

### Questions for the device matrix

- Does `when: 'unseen'` get its answer from a frozen tab in time, or does it have to treat silence as "not seen"?
- Which phones vibrate for a page at all, and only after a click?
