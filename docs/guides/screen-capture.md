# Screen capture

`butler.screenCapture` captures what is on the screen: a whole screen, a window or a tab. It works like
[`butler.camera`](camera.md), requirements in and a session out, with one difference: the browser shows its own
picker, and the user chooses there. The page cannot list what could be shared, and cannot choose for the user.

Try it: `pnpm demo`, page `screen/`.

## Capturing

```ts
button.addEventListener('click', async () => {
  const screen = await butler.screenCapture.open({
    prefer: { surface: 'window', audio: true, frameRate: 30 },
    content: 'text',
  })

  preview.srcObject = screen.stream
  screen.surface // 'monitor' | 'window' | 'browser' | undefined
  screen.audio // the track of the sound, if the user shared it
})
```

`open()` has to be called in answer to a click or a key: the browsers show the picker only then. Called otherwise, it
fails with a `MediaError` that says so. Chromium is less strict than Firefox here, so try it in Firefox before you
rely on it.

`butler.screenCapture.isSupported` is `false` where the browser cannot capture the screen. That is every browser on a
phone, and every page that was not loaded over HTTPS.

## Saying what you need

`require` is what the capture must have, `prefer` what it should have. Both take the same traits:

| Trait                          | In `prefer`                                      | In `require`                                                    |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------------------------- |
| `surface`                      | what the picker offers first                     | the user has to choose this kind of surface                     |
| `audio`                        | the sound is offered; the user can leave it out  | the user has to share the sound                                 |
| `width`, `height`, `frameRate` | what the browser is asked to deliver             | what is shared delivers at least this                           |
| `cursor`                       | the mouse pointer is in the picture              | the browser has to put it in                                    |

The browsers take no `min` and no `exact` for a capture of the screen and reject such a call, so the library asks for
everything as a hint. It asks for what is preferred, and for what is required where nothing is preferred. What is
required is checked once the user has chosen. A capture that does not have it is stopped again, and `open()` fails
with a `MediaRequirementsError` that names what was missing. The user sees the picker again on the next call, so
tell them what to choose.

A trait that the browser does not report is not held against the capture. Firefox does not say what was shared, so
`require: { surface: 'monitor' }` cannot fail there, and `screen.surface` is `undefined`.

The other fields:

| Field            | Meaning                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `content`        | `text` keeps text sharp for slides and documents, `motion` keeps videos smooth. Default: the browser decides. |
| `excludeThisTab` | leave the tab of the page out of the picker, so the user cannot share the page with itself. Default: `false`. |
| `focus`          | `keep-page`: the page stays in front once the user chose a tab or a window. `captured`: what is shared comes to the front. Only Chromium can be told; the others decide themselves. |

As for the camera, the `screenCapture` section of the configuration holds the defaults, a field of `open()` replaces
the configured field as a whole, and `butler.screenCapture.configure()` changes the defaults later.

## The session

A `ScreenCaptureSession` is a [media session](camera.md#the-session) like the one of a camera:

```ts
screen.on('ended', ({ reason }) => {
  // 'closed': the application closed it; 'device': the user pressed "stop sharing"
})

screen.on('settingschange', ({ width, height }) => {
  // the user resized the shared window
})

await screen.configure({ frameRate: 5 }) // less work for a slide that does not move
await screen.close()
```

- `track` is the picture, `audio` the sound; both are in `stream`.
- Stopping to share through the browser or the system ends the session with `device`. The sound stops with it.
- No other tab can take a capture over, and several captures can run at once, in one tab or in several. There is no
  lock and no `whenBusy`.
- `butler.dispose()` stops every capture the butler opened.

## Recording the screen with a voice

`butler.media.join()` puts the tracks of sessions that are open into one stream, and the recorder takes it:

```ts
await using screen = await butler.screenCapture.open({ content: 'text' })
await using microphone = await butler.microphone.open({ prefer: { noiseSuppression: true } })

using joined = butler.media.join(screen, microphone)
const recording = await butler.recorder.record(joined)

const { blob } = await recording.finished // ends when the user stops sharing, or with recording.stop()
```

The joined source ends when the first of its sessions ends, and the recording with it. It does not own the sessions:
the others keep running until the application closes them. A session that continues with a new track, such as a
microphone that was started again, keeps its place in the stream.

The complete example is the [screen tutorial](../use-cases/screen-tutorial.md).

## Errors

| Error                    | Thrown when                                                                   |
| ------------------------ | ----------------------------------------------------------------------------- |
| `UnsupportedError`       | the browser cannot capture the screen, which includes the browsers on phones  |
| `PermissionDeniedError`  | the user cancelled the picker, or the browser or the system does not allow it. `permission` is `display-capture`. |
| `MediaRequirementsError` | what the user chose does not have what is required; `constraint` names the first trait |
| `MediaError`             | `open()` was not called in answer to the user, the system did not let the browser capture the screen, or the butler was disposed |

On macOS the system has to allow the browser to record the screen, in its settings for privacy. Until the user
allows it, the browser refuses; which of the errors above that is in each browser is still open in the
[device matrix](../device-matrix/README.md).
