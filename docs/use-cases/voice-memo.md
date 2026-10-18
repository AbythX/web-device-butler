# Voice memos

**Goal.** The user records memos. A level display shows that the microphone hears something. A recording is in the
storage while it runs, so a page that is thrown away in the middle of a memo does not lose it, and it stops in an
orderly way before the storage is full.

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

## Keeping it in the storage

```ts
const recording = await butler.recorder.record(session, {
  keep: { namespace: 'memos', after: 'keep' },
  keepAwake: true, // the phone does not lock in the middle of a memo
})

recording.on('progress', ({ duration, bytes }) => showProgress(duration, bytes))
```

Every piece the browser hands over (one per second, `interval`) is written into the storage as it arrives, next to
a description of the recording. `after: 'keep'` leaves the memo there once it was stopped; without it, `finished`
reads it back and removes it. The library chooses a backend that keeps bytes as they are and lives with the origin,
IndexedDB or OPFS; `keep.storage` takes requirements like `butler.storage.open()`.

## Stopping

```ts
try {
  await recording.stop()
} finally {
  await session.close()
}
```

The memo is in the storage as `finished`, with its format, its length and its size. `recording.discard()` removes
it instead.

## The list of memos

```ts
for (const memo of await butler.recorder.kept('memos').list()) {
  // memo.state: 'finished' | 'recording' (in this tab or another) | 'interrupted'
  show(memo.startedAt, memo.duration, memo.bytes, memo.state)
}
```

`interrupted` is a memo whose page was thrown away, closed or crashed while it recorded. It has everything up to
the last piece that was written, and plays like any other.

## Before the storage is full

```ts
using space = butler.storage.watchSpace({ interval: 2000, lowBelow: 20 * 1024 * 1024 })
space.on('low', () => stop())
```

Stopping with a reserve keeps the recording as it is. Running into the storage limit stops the recording too:
`finished` rejects with a `StorageQuotaExceededError`, and what was kept until then stays as an `interrupted` memo.

## When the microphone goes away

A headset is unplugged, or the user stops the microphone in the browser:

```ts
await recording.finished // resolves however the recording ended
```

The recording ends by itself when its session does, and keeps what was recorded until then.

## Playing a memo

```ts
const { segments } = await memo.read()

audio.src = URL.createObjectURL(segments[0].blob)
await audio.play()
```

`read()` puts the pieces together and writes the length into a WebM file, also into one that was interrupted, so a
player can show it and jump in it. There is one segment, unless the microphone was started again while it
recorded; see [segments](../guides/recording.md#segments). `memo.delete()` removes a memo; one that a tab records
right now cannot be deleted.

## Muting

```ts
session.muted = true
```

The microphone keeps running and delivers silence. The recording has no gap and its length stays right, which
pausing the recorder would not give.

## Several tabs

Two tabs can record at once, each with its own session and its own memo. To prevent that, open with
`exclusive: true`; the second tab then gets a `MediaDeviceBusyError`. A memo the other tab records is listed as
`recording`; the demo reads the list again when the page becomes visible.

## Memory

A memo is in the storage while it records, not in memory. `read()` and `finished` put it together as a `Blob`,
which the browser may hold in memory; a memo of an hour is better played from a file. Where the browser has no
backend that lives with the origin, the memos end up in memory and are gone after a reload: check
`butler.storage.prepare({ require: { persistence: 'origin' } })` and say so.
