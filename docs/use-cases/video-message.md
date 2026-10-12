# Video message

**Goal.** The user records a short video of themselves with sound. Nothing interrupts a running recording, not even
the same application in another tab.

**Demo.** `pnpm demo`, page `use-cases/video-message/`. Open it in two tabs. Source:
[`demo/use-cases/video-message/main.ts`](../../demo/use-cases/video-message/main.ts).

## One session for both devices

```ts
const butler = DefaultDeviceButler.create({
  camera: { facing: 'front', resolution: { width: 1280, height: 720 } },
  microphone: { processing: { echoCancellation: true, noiseSuppression: true } },
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
await butler.media.open({ camera: { facing: 'back' }, microphone: { exclusive: true } })
```

## Recording

```ts
const recorder = new MediaRecorder(session.stream)
const pieces: Blob[] = []
recorder.addEventListener('dataavailable', ({ data }) => pieces.push(data))
recorder.addEventListener('stop', () => {
  session.allowTakeover = true
  send(new Blob(pieces, { type: recorder.mimeType }))
})

session.allowTakeover = false
recorder.start()
```

A short message fits in memory. For a long one, write the pieces to a store as a stream, as the
[voice memos](voice-memo.md#recording-into-the-storage) do.

## Not being interrupted

Only one tab can run a camera. Another tab that wants it asks with `whenBusy: 'takeover'`, and by default gets it:
the session here ends with the reason `'taken-over'`.

`session.allowTakeover = false` refuses. The other tab gets a `MediaDeviceBusyError` and can tell its user that a
recording runs elsewhere. Set it back when the recording is over, so the preview does not block the camera for
good.

What it does not cover: a phone call, another application or the system can still take the camera. That arrives as
`statechange` to `muted`, or as `ended` with the reason `'device'`. A recorder stops by itself when its tracks end
and keeps what it has, so the `stop` listener above still delivers the message.

## Switching the camera before recording

```ts
await session.camera.switchTo({ facing: 'back' })
```

The combined session keeps delivering through the same `stream`, so the preview needs no new `srcObject`. Do it
before the recording starts: a `MediaRecorder` does not follow a track that is replaced.
