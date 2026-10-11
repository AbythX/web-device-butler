# Microphone

`device.microphone` works like [`device.camera`](camera.md): requirements in, a session out. Microphones are simpler
than cameras: there is no facing, and a browser mostly knows what a microphone can do without starting it.

Try it: `pnpm demo`, page `microphone/`.

## Opening a microphone

```ts
const session = await device.microphone.open({
  prefer: { default: true },
  processing: { noiseSuppression: true, echoCancellation: false },
})
```

| Field         | Meaning                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `require`     | a microphone without these is never returned: `echoCancellation`, `noiseSuppression`, `autoGainControl`, `minChannelCount` |
| `prefer`      | the same fields plus `default`, the microphone the user chose as the default of the system; ranks      |
| `processing`  | what the session starts with: each of the three switched on or off. A field that is not set leaves the decision to the browser. |
| `channelCount`, `sampleRate` | the closest the microphone can do                                                       |
| `exclusive`   | keep the other tabs of the application away from the microphones while the session runs. Default: `false`. |
| `autoRecover` | start the microphone again when the system ends it                                                     |
| `id`, `whenBusy`, `constraints`, `signal` | as for the [camera](camera.md#saying-what-you-need)                        |

`require` and `prefer` are about what a microphone **can** do, `processing` about what it **does**. To record music,
require nothing and switch everything off:

```ts
await device.microphone.open({
  processing: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
})
```

## Looking at the microphones

```ts
await device.microphone.list() // never prompts; empty until access has been requested
await device.microphone.select({ require: { minChannelCount: 2 } })
await device.microphone.initialize() // { permission, microphones, selected, error }
```

A `MicrophoneDescriptor` has `id`, `label`, `isDefault` and `features`: the three kinds of processing (whether they
are available, not whether they are on), `maxChannelCount` and `maxSampleRate`. `detail` says how far to trust them,
as for a [camera](camera.md#looking-at-the-cameras).

Browsers that list "the default" as an entry of its own next to the microphone it stands for get that entry removed:
every microphone is listed once. `{ id: 'default' }` still opens the microphone the entry stood for.

## The session

```ts
session.stream // for MediaRecorder, an <audio> element, Web Audio or WebRTC
session.descriptor
session.settings // echoCancellation, noiseSuppression, autoGainControl, channelCount, sampleRate
session.state // 'live' | 'muted' | 'ended'

await session.close()
```

### Processing

```ts
session.processing.available // which of the three this microphone has
session.processing.noiseSuppression // whether it is on, read from the microphone

await session.processing.set({ noiseSuppression: false })
```

Some browsers (Chromium) accept such a change for a running microphone without making it. The session then starts
the microphone again with the new processing: the same session, a new track, a new `stream` and a short gap in the
sound, during which the state is `muted`. It announces `trackchange` and `settingschange`. If the microphone does
not start with the new processing, `set()` rejects and the session returns to what it ran with; if that does not
start either, the session ends with the reason `device`.

Two consequences:

- A `MediaRecorder` records the stream it was created with. Decide the processing before the recording starts, or
  create a new recorder on `trackchange`.
- Read the getters afterwards instead of assuming. With the fake microphone of Chromium, switching echo
  cancellation off also switched noise suppression and auto gain off, because they had been left to the browser. Set
  every field you care about.

### Muting

```ts
session.muted = true
session.on('mutechange', (muted) => {})
```

The microphone keeps running and delivers silence, so a recording has no gap and unmuting has no delay. This is not
the `muted` **state** of the session, which is the system pausing the device.

### Level

```ts
const subscription = session.level?.on('change', (level) => {
  meter.value = level // 0 (silence) to 1
})

subscription?.unsubscribe() // stops measuring
```

Measuring runs an audio context, so it only happens while someone listens to `change`. `level` is `undefined` where
the browser has no Web Audio. Browsers do not let a page analyse sound before the user has interacted with it; until
then nothing is reported, which a level display has to tell apart from a dead microphone.

### Events

`statechange`, `trackchange` and `ended` as for a [camera session](camera.md#events), plus `settingschange` and
`mutechange`.

## Several tabs

Several tabs can record from a microphone at once, so by default a second tab simply gets its own session. An
application that must not be recorded twice opens with `exclusive: true`; the other tabs then get what
[`whenBusy`](multiple-tabs.md#camera-and-microphone) says.

## Camera and microphone together

To record a picture with its sound, open both as one session:

```ts
await using recording = await device.media.open({
  camera: { facing: 'front' },
  microphone: { processing: { echoCancellation: true } },
})

video.srcObject = recording.stream // one stream with both tracks
new MediaRecorder(recording.stream).start()

await recording.camera.torch?.set(true) // each part is a full session
recording.microphone.muted = true
```

- If the microphone cannot be opened, the camera is closed again and the call fails with the error of the
  microphone. There is a session with both or none.
- They end together: when one ends, for whatever reason, the other is closed. `ended` carries the `reason` and, if
  the application did not close the session, the `source` (`'camera'` or `'microphone'`) that ended first.
- `recording.allowTakeover = false` keeps other tabs from taking the camera, see
  [the video message](../use-cases/video-message.md).

## Not verified yet

Tested against fakes and with the fake microphones of Chromium and Firefox. Whether two tabs can record at once on
iOS, and which browsers change the processing of a running microphone in place, are open questions of the
[device matrix](../device-matrix/README.md).
