# Video message

**Goal.** The user records a short video of themselves with sound. Nothing interrupts a running recording, not even
the same application in another tab.

**Demo.** `pnpm demo`, page `use-cases/video-message/`. Open it in two tabs. Source:
[`demo/use-cases/video-message/main.ts`](../../demo/use-cases/video-message/main.ts).

## One session for both devices

```ts
const butler = DefaultDeviceButler.create({
  camera: { require: { facing: 'front' }, prefer: { width: 1280, height: 720 } },
  microphone: { prefer: { echoCancellation: true, noiseSuppression: true } },
})

const session = await butler.media.open()

preview.srcObject = session.stream // one stream with the picture and the sound
preview.muted = true // or the user hears themselves
```

`butler.media.open()` saves the bookkeeping of two sessions:

- If the microphone cannot be opened (no permission, none there), the camera is closed again and the call fails
  with the error of the microphone. No camera light stays on behind an error message.
- They end together. `ended` says why and which device ended first:

```ts
session.on('ended', ({ reason, source }) => {
  // reason: 'closed' | 'taken-over' | 'device'
  // source: 'camera' | 'microphone', unless the application closed the session
})
```

Each part stays a full session: `session.camera.torch`, `session.camera.switchTo()`, `session.microphone.muted`.
Requirements for one call go to the part they belong to:

```ts
await butler.media.open({ camera: { require: { facing: 'back' } }, microphone: { exclusive: true } })
```

## Recording

```ts
const recording = await butler.recorder.record(session, { keepAwake: true })

// when the user is done
const { blob } = await recording.stop()
send(blob)
```

The library chooses a format the browser can write; `recording.mimeType` and `blob.type` say which. A short message
fits in memory. For a long one, write the pieces to a store as a stream, as the
[voice memos](voice-memo.md#recording-into-the-storage) do.

## Not being interrupted

Only one tab can run a camera. Another tab that wants it asks with `whenBusy: 'takeover'`, and by default gets it:
the session here ends with the reason `'taken-over'`.

A recording refuses for as long as it runs: it sets `session.allowTakeover` to `false` and back when it is over,
so the preview does not block the camera for good. The other tab gets a `MediaDeviceBusyError` and can tell its
user that a recording runs elsewhere. Set `session.allowTakeover = false` yourself to refuse at other times.

What it does not cover: a phone call, another application or the system can still take the camera. That arrives as
`statechange` to `muted`, or as `ended` with the reason `'device'`. A recording ends by itself when its session
ends and keeps what it has: `await recording.finished` delivers the message however the recording ended.

## Switching the camera before recording

```ts
await session.camera.switchTo({ require: { facing: 'back' } })
```

The combined session keeps delivering through the same `stream`, so the preview needs no new `srcObject`. Do it
before the recording starts: a browser cannot continue a file with another track, so a camera that is switched
while it records continues the recording in a [second segment](../guides/recording.md#segments).
