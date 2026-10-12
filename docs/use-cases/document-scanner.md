# Document scanner

**Goal.** The user photographs documents with the back camera of a phone, with light and zoom where the phone has
them. The photos survive a reload and do not fill the memory.

**Demo.** `pnpm demo`, page `use-cases/document-scanner/`. Source:
[`demo/use-cases/document-scanner/main.ts`](../../demo/use-cases/document-scanner/main.ts).

## The camera

```ts
const butler = DefaultDeviceButler.create({
  camera: {
    require: { facing: 'back' },
    prefer: { torch: true, zoom: true, width: 1920, height: 1080 },
    autoRecover: true,
  },
  storage: { namespace: 'scanner' },
})
```

- `prefer`, not `require`, for the torch, the zoom and the size: a scanner works without them. On a laptop this configuration opens the webcam; with
  `require: { torch: true }` it would fail there with a `MediaRequirementsError`.
- `autoRecover`: a user who switches to another application to look something up comes back to a running camera.

```ts
const session = await butler.camera.open()
video.srcObject = session.stream

// the camera was started again: there is a new stream
session.on('trackchange', () => (video.srcObject = session.stream))
```

## Light and zoom

The controls exist only if the camera has the feature, so the user interface is built from what is there:

```ts
torchButton.hidden = session.torch === undefined
torchButton.onclick = () => session.torch?.toggle()

const zoom = session.zoom
zoomSlider.hidden = zoom === undefined
if (zoom) {
  Object.assign(zoomSlider, { min: zoom.range.min, max: zoom.range.max, step: zoom.range.step ?? 0.1 })
  zoomSlider.oninput = () => zoom.set(zoomSlider.valueAsNumber)
}
```

The slider can call `zoom.set()` on every movement; the session applies the changes one after another. Read
`session.torch` and `session.zoom` again after `trackchange`, the controls belong to the track.

## Taking the photo

The library delivers the stream; the photo is a frame of the video, drawn to a canvas:

```ts
const canvas = document.createElement('canvas')
canvas.width = video.videoWidth
canvas.height = video.videoHeight
canvas.getContext('2d')?.drawImage(video, 0, 0)

const picture = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
```

## Keeping the photos

Two stores: the pictures as bytes where large data belongs, and what is known about them as JSON.

```ts
const pictures = await butler.storage.open({
  driver: ['opfs', 'indexeddb', 'memory'],
  namespace: 'scans',
  codec: new BinaryCodec(),
})
const scans = await butler.storage.open<Scan>({ driver: ['indexeddb', 'local', 'memory'], namespace: 'scan-index' })

const id = crypto.randomUUID()
await pictures.set(id, new Uint8Array(await picture.arrayBuffer()))
await scans.set(id, { id, takenAt: Date.now(), bytes: picture.size })
```

- The picture is written first, so an entry of the index always has a picture. Deleting goes the other way round.
- One entry per scan instead of one list of all scans: two tabs that scan at once cannot overwrite each other's
  list, and nothing has to be read to add a scan.
- `pictures.capabilities.persistence` tells whether the chain ended in `memory`. Then the scans are gone after a
  reload, and the user should know.

Showing them:

```ts
for await (const [id, scan] of scans.entries()) {
  const bytes = await pictures.get(id)
  // the store never returns shared memory, which is all the type of Blob rules out
  if (bytes) image.src = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
}
```

Revoke the object URLs when the pictures leave the page.

## When the storage is full

```ts
try {
  await pictures.set(id, bytes)
} catch (error) {
  if (error instanceof StorageQuotaExceededError) {
    showNotice(`The storage is full. Delete some scans.`)
  } else {
    throw error
  }
}
```

`(await butler.storage.space()).hasRoomFor(bytes.byteLength)` can warn before the user takes the photo, but it is an
estimate: the `catch` stays. `butler.storage.persist()` asks the browser not to evict the scans under storage
pressure, which is worth a call once the user has scanned something.

## A second tab

- The camera runs in one tab. The second tab gets a `MediaDeviceBusyError` with `holder: 'other-tab'` and can offer
  to take the camera over; the first tab is told through `ended` with the reason `'taken-over'`. The code is in
  [Several tabs](../guides/multiple-tabs.md#camera-and-microphone).
- The scans are shared. A tab that listens to `scans.on('change')` and reloads its list for `origin: 'remote'` shows
  what the other tab scanned or deleted.

## Variations

- **A camera picker**: `butler.camera.list({ detail: 'probed' })` on a settings screen, `open({ id })` afterwards.
- **Macro shots**: `prefer: { focus: true }`, then `session.focus?.setMode('manual')` and
  `session.focus?.setDistance()`.
- **Photos at full resolution**: `prefer: { ...descriptor.features.maxResolution?.toJSON() }` of the selected
  camera.
