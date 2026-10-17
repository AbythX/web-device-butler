# Screen tutorial

**Goal.** The user records what they do on the screen and explains it while they do: a tutorial, a bug report, a
walk through slides. The result is one video with the picture of the screen and the voice of the user.

**Demo.** `pnpm demo`, page `screen/`, section "Screen capture". Source:
[`demo/screen/main.ts`](../../demo/screen/main.ts).

## Capturing in answer to a click

```ts
const butler = DefaultDeviceButler.create({
  screenCapture: { prefer: { surface: 'window' }, content: 'text', excludeThisTab: true },
  microphone: { prefer: { echoCancellation: true, noiseSuppression: true } },
})

start.hidden = !butler.screenCapture.isSupported // nothing to offer on a phone

start.addEventListener('click', () => void record())
```

The browser shows its picker only in answer to the user, so `record()` starts from the click and opens the screen
before anything else. A `MediaError` that says a click is needed means some `await` came first.

- `prefer: { surface: 'window' }` makes the picker offer windows first. A tutorial of one application rarely needs
  the whole screen, with its notifications and other windows.
- `content: 'text'` keeps the text of the screen readable in the video.
- `excludeThisTab` keeps the user from recording the page that records.

## One recording of both

```ts
const record = async () => {
  const screen = await butler.screenCapture.open()
  const microphone = await butler.microphone.open().catch(() => undefined) // without a voice, if need be

  const source = microphone === undefined ? screen : butler.media.join(screen, microphone)
  const recording = await butler.recorder.record(source)

  stop.onclick = () => void recording.stop()

  try {
    const { blob } = await recording.finished
    await butler.files.save(blob, { name: 'tutorial.mp4' })
  } finally {
    await Promise.all([screen.close(), microphone?.close()])
  }
}
```

- The recording ends with `stop()`, and also when the user stops sharing through the browser: the screen session
  ends with `device`, the joined source with it, and the recording keeps what it has.
- `join()` does not close the microphone when the screen ends. The application opened it and closes it.
- The name of the file should fit `result.mimeType`, which is MP4 where the browser can write it and WebM elsewhere.

## A long tutorial

A recording is kept in memory until it stops. For a long one, write it into the storage as a stream with `into`, as
the [voice memos](voice-memo.md) do.
