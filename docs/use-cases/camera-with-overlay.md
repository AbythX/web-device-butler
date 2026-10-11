# Camera with an overlay

**Goal.** The camera picture fills an area of the page, with a frame, a logo or a text drawn over it, and a
recording contains the picture together with what was drawn.

This needs the optional entry point `web-device-butler/fabric` and [fabric](https://fabricjs.com) (6 or newer) in
the application. There is no demo page for it.

## The renderer

```ts
import { Group, Rect, FabricText } from 'fabric'
import { FabricCameraFactory } from 'web-device-butler/fabric'

const session = await device.camera.open()
const renderer = await new FabricCameraFactory({ frameRate: 30 }).create(session)

container.append(renderer.output.getElement()) // the canvas
renderer.resize(container.clientWidth, container.clientHeight)
```

The renderer draws the camera to a fabric `StaticCanvas`. The picture keeps the resolution of the camera and is
cropped to the shape of the area, the way `object-fit: cover` does, so what is recorded from the canvas is as sharp
as the camera delivers it.

Call `resize()` whenever the area changes:

```ts
const observer = new ResizeObserver(([entry]) => {
  renderer.resize(entry.contentRect.width, entry.contentRect.height)
})
observer.observe(container)
```

The renderer follows the camera by itself: after `session.switchTo()` or a `session.configure()` that changes the
resolution, it fits the new picture.

## Drawing over the picture

```ts
const frame = new Group([
  new Rect({ left: 20, top: 20, width: 280, height: 180, fill: '', stroke: 'white', strokeWidth: 2 }),
  new FabricText('Place the document here', { left: 20, top: 210, fontSize: 14, fill: 'white' }),
])

renderer.add(frame)
```

Put the objects in a `Group` and give them the size they should have on the display: groups are scaled with the
canvas, so they keep that size whatever resolution the camera delivers. The canvas itself has the pixels of the
camera picture; to place a group, use the canvas (`renderer.output.centerObject(frame)`,
`renderer.output.getWidth()`), and place it again after a `resize()`. Everything else of fabric works on
`renderer.output` as well.

## Recording the picture with the overlay

The canvas is a source of a stream:

```ts
const picture = renderer.output.getElement().captureStream(30)
const recorder = new MediaRecorder(picture)
```

With sound, open the microphone as well and combine the tracks:

```ts
const microphone = await device.microphone.open()
const recorder = new MediaRecorder(new MediaStream([...picture.getVideoTracks(), microphone.track]))
```

`device.media.open()` is not the tool here: its stream carries the picture of the camera, without the overlay.

A photo is the canvas as an image: `renderer.output.toDataURL({ format: 'jpeg', quality: 0.9, multiplier: 1 })`.

## Cleaning up

The renderer does not own the camera. The application opened the session and closes it; disposing the renderer
leaves the camera running, so the same session can move to another view.

```ts
observer.disconnect()
renderer.dispose()
await session.close()
```

Or with `using`, in the order they were created:

```ts
await using session = await device.camera.open()
using renderer = await new FabricCameraFactory().create(session)
```

## In a Vue component

```ts
import { useCamera, useDevice } from 'web-device-butler/vue'

const camera = useCamera(useDevice().camera) // closed when the component is unmounted
let renderer: FabricCameraRenderer | undefined

onMounted(async () => {
  const session = await camera.open()
  if (session) {
    renderer = await new FabricCameraFactory().create(session)
    container.value?.append(renderer.output.getElement())
  }
})
onBeforeUnmount(() => renderer?.dispose())
```

`camera.error` holds why `open()` failed; it is not thrown.
