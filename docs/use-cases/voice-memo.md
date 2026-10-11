# Voice memos

**Goal.** The user records memos of any length. A level display shows that the microphone hears something. A
recording does not sit in memory until it is finished, and it stops in an orderly way before the storage is full.

**Demo.** `pnpm demo`, page `use-cases/voice-memo/`. Source:
[`demo/use-cases/voice-memo/main.ts`](../../demo/use-cases/voice-memo/main.ts).

## The microphone

```ts
const session = await device.microphone.open({
  processing: { noiseSuppression: true, echoCancellation: false, autoGainControl: true },
})
```

Decide the processing here, not during the recording: a browser that cannot change it in place makes the session
start the microphone again, with a new stream that a running `MediaRecorder` does not follow. See
[Microphone](../guides/microphone.md#processing).

## The level

```ts
session.level?.on('change', (level) => (meter.value = level)) // 0 to 1
```

The level is measured only while this listener exists. It is `undefined` where the browser has no Web Audio.

## Recording into the storage

The recorder of the browser delivers pieces; each goes straight into a stream of the store.

```ts
const sounds = await device.storage.open({
  driver: ['opfs', 'memory'], // the drivers that can stream
  namespace: 'memos',
  codec: new BinaryCodec(),
})

const id = crypto.randomUUID()
const writer = (await sounds.writeStream(id)).getWriter()
const recorder = new MediaRecorder(session.stream)

// the pieces arrive faster than they are converted, so the writes are chained to keep their order
let writing = Promise.resolve()
recorder.addEventListener('dataavailable', ({ data }) => {
  writing = writing.then(async () => writer.write(new Uint8Array(await data.arrayBuffer())))
})

recorder.start(1000) // a piece every second
```

Until the stream is closed the entry does not exist for anyone else, and no other tab can write or delete it.

## Stopping

```ts
try {
  // the recorder delivers its last piece before it reports that it stopped
  await new Promise((resolve) => {
    recorder.addEventListener('stop', resolve, { once: true })
    recorder.stop()
  })
  await writing
  await writer.close() // now the memo is there, in one step

  await memos.set(id, { id, recordedAt, duration, mimeType: recorder.mimeType })
} catch (error) {
  await writer.abort(error) // nothing is kept of a recording that could not be written to its end
  throw error
} finally {
  await session.close()
}
```

- `memos` is a second store, opened without a codec, that holds what is known about each memo as JSON.
- Keep `recorder.mimeType` with the memo. Browsers record in different formats, and the player has to be told.
- The stream has to be closed or aborted on every path. An abandoned stream keeps the entry locked until the tab is
  closed.

## Before the storage is full

```ts
using space = device.storage.watchSpace({ interval: 2000, lowBelow: 20 * 1024 * 1024 })
space.on('low', () => stop())
```

Stopping with a reserve keeps the recording. Running into the `StorageQuotaExceededError` loses the piece that did
not fit, and with `abort()` the whole recording.

## When the microphone goes away

A headset is unplugged, or the user stops the microphone in the browser:

```ts
session.on('ended', ({ reason }) => {
  if (reason !== 'closed') stop() // keep what was recorded
})
```

## Playing a memo

```ts
const stream = await sounds.readStream(id)
const sound = await new Response(stream).blob()

audio.src = URL.createObjectURL(new Blob([sound], { type: memo.mimeType }))
await audio.play()
```

While the stream is read, writers of the entry wait.

## Muting

```ts
session.muted = true
```

The microphone keeps running and delivers silence. The recording has no gap and its length stays right, which
pausing the recorder would not give.

## Several tabs

Two tabs can record at once, each with its own session. To prevent that, open with `exclusive: true`; the second tab
then gets a `MediaDeviceBusyError`. The list of memos follows the other tab through `memos.on('change')`.

## Where streams are not available

`['opfs', 'memory']` ends in memory where a browser has no OPFS: the memos work and are gone after a reload. Check
`sounds.capabilities.persistence` and say so. The alternative is to collect the pieces and store them with one
`set()` in `indexeddb`, which limits the length of a memo to what fits in memory.
