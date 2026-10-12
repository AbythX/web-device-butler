# Camera

A browser lists cameras as ids and labels. Which of them is the main camera on the back, which one has a torch and
which one can deliver 1080p is not in the list: a camera has to run before it says what it can do, and a phone has
up to five of them. `butler.camera` hides that. The application says what it needs and gets a running camera.

Try it: `pnpm demo`, page `camera/`.

## Saying what you need

```ts
const session = await butler.camera.open({
  require: { facing: 'back', torch: true },
  prefer: { zoom: true, width: 1920, height: 1080 },
})
```

`require` is what the camera must have: a camera without it is never returned. `prefer` is what it should have:
among the cameras that have what is required, those with it rank higher. Both take the same traits.

| Trait             | In `require`                                                        | In `prefer`                                   |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `facing`          | `'front'` or `'back'`, and no other side. On a device where no camera says which side it is on, such as a laptop, the cameras that do not say are used. | that side first, then the cameras that do not say, then the other side |
| `torch`, `zoom`, `focus` | the camera has it. `false` asks for nothing.                 | cameras that have it rank higher              |
| `width`, `height` | the camera can deliver at least this, in pixels                     | cameras that can deliver it rank higher       |
| `frameRate`       | the camera can deliver at least this many frames per second         | cameras that can deliver it rank higher       |

The preferred width, height and frame rate are also what the running camera is asked to deliver, the closest it
can do. Where none is preferred, the required one is asked for:

```ts
await butler.camera.open({
  require: { width: 1280, height: 720 }, // never a camera that cannot do 720p
  prefer: { width: 1920, height: 1080 }, // 1080p from a camera that can
})
```

A width and a height written together are one size. A phone that is held upright swaps them, so the longer and the
shorter sides are compared with each other: `{ width: 1920, height: 1080 }` fits a camera whichever way the device
is held. One of them alone is compared with the same side of the largest picture the browser reports for the
camera, which is the picture of a device held sideways, so `width` alone means the long side of a phone.

Having a torch is not switching it on: `torch: true` never lights it. That is [`session.torch`](#torch-zoom-focus).

The other fields say how to ask:

| Field        | Meaning                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `strategy`   | `'best'` (default) looks at every camera that can match; `'first'` takes the first that has what is required, which starts fewer cameras on the first visit |
| `id`         | this camera and no other, by the `id` of its descriptor                                              |
| `whenBusy`   | what happens when the camera is held: `'fail'` (default), `'wait'`, `'takeover'`. See [Several tabs](multiple-tabs.md). |
| `autoRecover`| start the camera again when the system ends it, for example when the page returns from the background on iOS |
| `constraints`| `MediaTrackConstraints`, passed to the browser as they are, for what the library has no field for, such as a size the camera has to deliver exactly: `{ width: { exact: 1920 } }` |
| `signal`     | an `AbortSignal` that stops waiting for a camera that is held                                        |

Use `require` for what the feature cannot work without, and `prefer` for the rest. A scanner works without a torch,
so it prefers one; a flashlight application requires it.

The cameras that have what is required are ordered by the preferred side, then by how many of the preferred torch,
zoom and focus they have, then by whether they can deliver the preferred width and height, then the preferred frame
rate. What is still equal is decided by the largest zoom range and the highest resolution, which lands on the main
camera of a phone and not on an auxiliary lens.

A side that is only preferred costs less than no side at all: access is requested for that side first, and the
other side is only requested and looked at if no camera of the preferred side has what is required.

If nothing fits, `open()` rejects with a `MediaRequirementsError` whose message says which requirement removed which
camera.

## What happens on the first visit, and afterwards

To find out what a camera can do, the library starts it for a moment. With `require: { torch: true }` on a phone
that means: request access, start the back cameras one after another, read what each reports, choose. The user sees
the permission prompt and waits a moment.

The result is remembered in the storage of the browser. On the next visit only the chosen camera starts. The memory
is thrown away by itself when the set of cameras changes; `butler.camera.forget()` throws it away by hand.

Do this work when it suits the application, with [`prepare()`](../use-cases/set-up-screen.md):

```ts
const result = await butler.camera.prepare()

result.permission // 'granted' | 'denied' | 'prompt' | 'unknown' | 'unsupported'
result.cameras // every camera that is known
result.selected // the one open() will start; undefined if none fits
result.isResolutionAvailable // whether it can deliver the preferred width and height, or the required ones
result.error // why there is no selected camera
```

## Looking at the cameras

```ts
await butler.camera.list() // never prompts, never starts a camera
await butler.camera.list({ detail: 'probed' }) // requests access and looks at every camera
await butler.camera.select({ require: { facing: 'front' } }) // the camera open() would start, without starting a session
```

A `CameraDescriptor` has `id`, `label`, `facing` (`'front' | 'back' | 'external' | 'unknown'`) and `features`:
`torch`, `zoom` (a range), `focusModes`, `focusDistance`, `maxResolution`, `resolutions`, `maxFrameRate`.

How far the features can be trusted is in `descriptor.detail`:

| `detail`  | The features are                                              |
| --------- | ------------------------------------------------------------- |
| `listed`  | unknown: only the id and the label come from the list         |
| `static`  | what the browser knows without starting the camera            |
| `probed`  | read from the running camera                                  |

The list is empty until access has been requested. `butler.camera.access` says how far that went, per side (`front`,
`back`, `any`): `'locked'` (not requested yet), `'granted'`, `'denied'` or `'unavailable'`. Cameras are requested per
side, because access that was granted through the front camera does not open the back cameras on every phone.

To build a camera picker, list with `detail: 'probed'` once on the set-up screen and open with `{ id }`. The id is
stable for the origin until the user clears the site data.

## The session

```ts
const session = await butler.camera.open()

video.srcObject = session.stream // also for WebRTC; to record it, see the recording guide
session.descriptor // the camera that runs
session.settings // what it delivers right now: resolution, frameRate
session.state // 'live' | 'muted' | 'ended'

await session.close()
```

The `<video>` needs `autoplay`, `muted` and `playsinline`, or iOS shows nothing.

### Torch, zoom, focus

A control exists only if the camera has the feature, so the check and the use are one expression:

```ts
await session.torch?.set(true)
await session.torch?.toggle() // resolves with the new state
session.torch?.enabled

const zoom = session.zoom
if (zoom) {
  zoom.range // { min, max, step }
  await zoom.set(2)
  await zoom.increase() // one step; decrease() likewise
  zoom.level
}

session.focus?.modes // for example ['continuous', 'manual']
await session.focus?.setMode('manual')
await session.focus?.setDistance(0.3) // within focus.distanceRange
```

The controls read from the camera on every access, they do not remember. Changes are applied one after another,
whatever order and speed they are called in, so a zoom slider can call `zoom.set()` on every movement.

The workarounds a platform needs are inside the session. On iOS, changing the zoom switches the torch off; the
session switches it on again.

### Changing a running camera

```ts
await session.configure({ width: 1280, height: 720, frameRate: 30 })

await session.switchTo({ require: { facing: 'front' } })
```

`configure()` changes what the session prefers: the camera delivers the closest it can do, and `session.settings`
says what it made of it.

`switchTo()` continues with another camera: the same session object, a new track and **a new `stream`**. The
requirements are merged over the ones the session runs with, and `require` and `prefer` are each replaced as a
whole: the example no longer requires the torch the session was opened with, which the front camera of a phone does
not have, and keeps what the session prefers. If no camera fits, the session returns to the camera it had.

The running camera is stopped before the next one starts, because a phone cannot run two. In between the state of
the session is `muted`. A session that lands on the camera it had, after a switch or after `autoRecover`, continues
with the torch, zoom and focus it had; another camera starts the way it is.

### Taking a photo

```ts
const photo = await session.takePhoto() // a Blob

const preview = await session.takePhoto({ source: 'frame', type: 'image/png' })
```

Some browsers can ask the camera for a still picture. Where that works, it is the photo: it can be larger than the
picture of the stream, and the camera may adjust its exposure for it. Everywhere else the photo is the picture of
the stream at that moment, which is also what `source: 'frame'` always takes: exactly what a preview shows.

- `type` and `quality` say how a picture of the stream is written: `image/jpeg` (default), `image/png` or
  `image/webp`, and from 0 to 1. A still picture of the camera comes in the format the camera delivers. Read
  `photo.type`.
- The session keeps running. A photo that is asked for while the camera is switched or started again is taken
  once the next camera delivers.
- To record instead, see [recording](recording.md).

### Events

```ts
session.on('statechange', (state) => {})
session.on('settingschange', (settings) => {}) // another resolution or frame rate, also after the phone was turned
session.on('devicechange', (descriptor) => {}) // after switchTo()
session.on('trackchange', (track) => {}) // a new stream: assign session.stream to the video again
session.on('ended', ({ reason }) => {}) // once
```

After `trackchange` the controls are new objects as well: read `session.torch` again instead of keeping it.

No event of a browser says that a phone was turned, so while someone listens to `settingschange` the session asks
the camera twice a second what it delivers.

| `state`  | Meaning                                                                                |
| -------- | -------------------------------------------------------------------------------------- |
| `live`   | the camera delivers                                                                    |
| `muted`  | nothing is delivered right now: the browser or the system paused the camera, for example while the page is in the background, or the session is switching or starting it again |
| `ended`  | the session is over                                                                    |

| `ended` reason | Meaning                                                              | What to do                              |
| -------------- | -------------------------------------------------------------------- | --------------------------------------- |
| `closed`       | the application closed the session                                   | nothing                                 |
| `taken-over`   | another tab asked for the camera with `whenBusy: 'takeover'`         | say so, offer to start again            |
| `device`       | the camera went away, or the browser or the user stopped it          | offer to start again, or use `autoRecover` |

A session that has ended rejects every call with a `SessionClosedError`. Open a new one.

## The background

A phone stops the camera of a page that is not visible. Without `autoRecover` the session ends with the reason
`device`. With `autoRecover: true` the session waits until the user can see the page again, starts the camera and
announces `trackchange`; in between its state is `muted`.

## Manager events

```ts
butler.camera.on('change', (cameras) => {}) // a camera was plugged in or removed
butler.camera.on('accesschange', (access) => {})
butler.camera.on('availabilitychange', (availability) => {}) // 'free' | 'held-by-this-tab' | 'held-by-other-tab'
```

## Not verified yet

The selection has been tested against fakes and with the fake cameras of Chromium and Firefox, not on real phones
and not in Safari. Which lens the selection lands on, and how long a phone takes to report its torch, are open
questions of the [device matrix](../device-matrix/README.md). If a device picks the wrong camera, a report from the
demo page is what helps.
