# Recording

`butler.recorder` records what a session delivers: a camera, a microphone or both together. It chooses a format the
browser can write, keeps the recording going when its device is started again, and writes it into memory or wherever
you say.

```ts
await using session = await butler.media.open()

const recording = await butler.recorder.record(session)

// later
const { blob, mimeType, duration } = await recording.stop()
player.src = URL.createObjectURL(blob)
```

## The format

Browsers write different formats, and none writes all of them. Without a `format` the library takes the first of the
common ones the browser can write, MP4 before WebM, because more players read MP4.

```ts
butler.recorder.formats('video') // what this browser can write, best first
butler.recorder.canRecord('video/webm;codecs=vp9')

// your own order of preference; the first one the browser can write is used
await butler.recorder.record(session, { format: ['video/webm;codecs=vp9', 'video/mp4'] })
```

- If the browser can write none of the formats you name, `record()` fails with an `UnsupportedError`.
- `recording.mimeType` says what is written, as the browser reports it: asked for `video/mp4`, a browser can
  answer `video/mp4;codecs=vp9`. Keep it with the recording: a player has to be told.
- The formats the library chooses from name no codecs, and yours should only name the ones the stream has. A
  browser that is told to write sound into the recording of a camera alone can wait for that sound and never
  finish the file.
- `audioBitsPerSecond` and `videoBitsPerSecond` are handed to the recorder of the browser as they are.

## While it runs

```ts
recording.state // 'recording' | 'paused' | 'stopped'
recording.duration // milliseconds, without the time it was paused
recording.bytes

recording.pause()
recording.resume()

recording.on('progress', ({ duration, bytes }) => showProgress(duration, bytes))
recording.on('statechange', (state) => {})
```

- `progress` is announced each time the recorder hands over data, once per second unless `interval` says otherwise.
- Other tabs cannot take the device with `whenBusy: 'takeover'` while the recording runs. The session gets back
  the `allowTakeover` it had when the recording is over. `holdDevice: false` leaves the session as it is.
- `keepAwake: true` keeps the screen on until the recording is over, through
  [`butler.wakeLock`](screen-network-sharing.md#keeping-the-screen-on). Where the browser cannot, the recording
  runs all the same.

## How it ends

```ts
const result = await recording.stop() // keeps it
await recording.discard() // drops what is being written

recording.finished // resolves with the same result, however the recording ended
```

A recording also ends by itself when its session ends: the device was unplugged, another tab took it, or the
application closed the session. What was recorded until then is kept; `recording.finished` resolves with it.

`finished` rejects, and so does `stop()`, if the recording could not be written to its end. Nothing is kept of the
segment that failed.

### When the page goes away

A page in the background can be thrown away without another word, most of all on a phone. So whenever the page is
hidden or frozen, the recording has the browser hand over what it recorded so far: with `into`, that much is
written by then. When the page is left (closed, reloaded, navigated away from) the recording ends, and keeps what
the browser still lets the page do. `stopOnLeave: false` lets it run on, for a page the browser keeps to return to.

What a stream that was never closed keeps is up to where it writes. A store only shows an entry once its stream is
closed, so a recording that must survive a page that dies has to be written to a place that keeps what it was
given piece by piece. See [the page](files-outbox-page.md#the-page).

## Jumping around in a WebM recording

A recorder writes a WebM file from front to back and cannot say how long it is when it writes the head. Players
then show no length and cannot jump to a position. The recordings that are kept in memory get their length written
into the file, so `blob` plays like any other file.

A recording that was written somewhere else through `into` is already there when its length is known. Fix it when
it is read:

```ts
import { WebmDuration } from 'web-device-butler/media'

const seekable = await WebmDuration.apply(file, duration, (parts, type) => new Blob(parts, { type }))
```

It returns the blob it was given if that is not a WebM file or has its length already. MP4 recordings need none of
this.

## Segments

A browser cannot continue a file with another track. When the device of a session is started again
(`autoRecover`, a change of the processing of a microphone) or replaced (`switchTo()`), the recording therefore
continues in a new file that plays on its own.

```ts
const { segments, blob } = await recording.stop()

segments.length // 1, unless the device was started again or replaced
segments[0].blob
blob // the recording, if it was kept in memory and is one segment
```

Most recordings have one segment. An application that switches the camera while it records gets one per camera,
and joins them on the server or plays them one after another.

## Writing somewhere else than into memory

A long recording does not belong in memory. `into` is asked for a stream per segment, and every piece the recorder
hands over is written into it at once:

```ts
const sounds = await butler.storage.open({
  namespace: 'memos',
  require: { streaming: true },
  codec: new BinaryCodec(),
})

const recording = await butler.recorder.record(session, {
  into: (segment) => sounds.writeStream(`${id}-${segment}`),
})

const { segments } = await recording.stop() // the entries exist now; `blob` is not set
```

- The stream of a segment is closed when the segment is finished, which is when a store makes the entry visible.
- `discard()` aborts the stream, and so does a write that fails: the entry stays as it was.
- See [streams](storage.md#streams) for which backends can be written this way, and
  [voice memos](../use-cases/voice-memo.md) for a complete example.

## Errors

| Error                | Thrown when                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| `UnsupportedError`   | the browser cannot record, or none of the formats that were asked for    |
| `SessionClosedError` | the session has ended already                                            |
| `MediaError`         | the browser does not start the recording, or it cannot be written; see `cause` |

## Not verified yet

Tested against a fake recorder, and in Chromium and Firefox with the fake devices of the browsers, where a
player is also asked for the length of a WebM recording and told to jump into it. It has not been run in Safari
or on real phones. That a browser ends the file when the tracks of a stream change is what the
specification says; whether every browser does is an open question of the
[device matrix](../device-matrix/README.md). A recorder that keeps recording the old stream is told to end the file
when the session delivers again.
