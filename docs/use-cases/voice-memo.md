# Voice memos

**Goal.** The user records memos of any length. A level display shows that the microphone hears something. A
recording does not sit in memory until it is finished, and it stops in an orderly way before the storage is full.

**Demo.** `pnpm demo`, page `use-cases/voice-memo/`. Source:
[`demo/use-cases/voice-memo/main.ts`](../../demo/use-cases/voice-memo/main.ts).

## The microphone

```ts
const session = await butler.microphone.open({
  prefer: { noiseSuppression: true, echoCancellation: false, autoGainControl: true },
})
```

Decide the processing here, not during the recording: a browser that cannot change it in place makes the session
start the microphone again, with a new stream, and the recording continues in a second file. See
[Microphone](../guides/microphone.md#processing).

## The level

```ts
session.level?.on('change', (level) => (meter.value = level)) // 0 to 1
```

The level is measured only while this listener exists. It is `undefined` where the browser has no Web Audio.

## Recording into the storage

`butler.recorder` hands every piece the browser records straight to a stream of the store.

```ts
const sounds = await butler.storage.open({
  driver: ['opfs', 'memory'], // the drivers that can stream
  namespace: 'memos',
  codec: new BinaryCodec(),
})

const id = crypto.randomUUID()

const recording = await butler.recorder.record(session, {
  into: (segment) => sounds.writeStream(segment === 0 ? id : `${id}-${segment}`),
  keepAwake: true, // the phone does not lock in the middle of a memo
})

recording.on('progress', ({ duration, bytes }) => showProgress(duration, bytes))
```

Until the stream is closed the entry does not exist for anyone else, and no other tab can write or delete it.

`into` is asked once per segment. There is one, unless the microphone is started again while it records; see
[segments](../guides/recording.md#segments).

## Stopping

```ts
try {
  // the last piece is written and the stream closed: now the memo is there, in one step
  const { duration, mimeType, segments } = await recording.stop()

  await memos.set(id, { id, recordedAt, duration, mimeType, segments: segments.length })
} finally {
  await session.close()
}
```

- `memos` is a second store, opened without a codec, that holds what is known about each memo as JSON.
- Keep the `mimeType` with the memo. Browsers record in different formats, and the player has to be told.
- A recording that could not be written to its end rejects, and nothing is kept of it: the stream is aborted, so
  the entry stays as it was. `recording.discard()` does the same on purpose.

## Before the storage is full

```ts
using space = butler.storage.watchSpace({ interval: 2000, lowBelow: 20 * 1024 * 1024 })
space.on('low', () => stop())
```

Stopping with a reserve keeps the recording. Running into the `StorageQuotaExceededError` loses the piece that did
not fit, and with `abort()` the whole recording.

## When the microphone goes away

A headset is unplugged, or the user stops the microphone in the browser:

```ts
const { segments } = await recording.finished // resolves however the recording ended
```

The recording ends by itself when its session does, and keeps what was recorded until then.

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
