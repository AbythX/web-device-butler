# Microphone

`butler.microphone` works like [`butler.camera`](camera.md): requirements in, a session out. Microphones are simpler
than cameras: there is no facing, and a browser mostly knows what a microphone can do without starting it.

Try it: `pnpm demo`, page `microphone/`.

## Opening a microphone

```ts
const session = await butler.microphone.open({
  require: { noiseSuppression: true },
  prefer: { default: true, echoCancellation: false },
})
```

`require` is what the microphone must have, `prefer` what it should have. Both take the same traits:

| Trait                                                     | In `require`                                             | In `prefer`                              |
| --------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| `echoCancellation`, `noiseSuppression`, `autoGainControl` | `true`: the microphone has it, and the session starts with it on | `true`: microphones that have it rank higher, and it is on where it exists |
| `channelCount`                                            | the microphone has at least this many channels, `2` for stereo | microphones that have them rank higher |
| `sampleRate`                                              | the microphone can deliver at least this, in hertz       | microphones that can rank higher         |
| `default`                                                 | only the microphone the user chose as the default of the system | that microphone ranks higher       |

A processing that is `false`, in either place, switches it off and says nothing about which microphone is chosen. A
processing that is not set is left to the browser, which switches on what the microphone has. Where `require` and
`prefer` name the same processing, `require` decides.

The preferred channel count and sample rate are also what the running microphone is asked to deliver, the closest
it can do; where none is preferred, the required one is.

The other fields say how to ask:

| Field         | Meaning                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------ |
| `exclusive`   | keep the other tabs of the application away from the microphones while the session runs. Default: `false`. |
| `autoRecover` | start the microphone again when the system ends it                                                     |
| `id`, `whenBusy`, `constraints`, `signal` | as for the [camera](camera.md#saying-what-you-need)                        |

To record music, require nothing and switch everything off:

```ts
await butler.microphone.open({
  prefer: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
})
```

To get a microphone that has a processing and start with it off, require it and switch it off in the session:
`open({ require: { noiseSuppression: true } })`, then `session.processing.set({ noiseSuppression: false })`.

A browser that says nothing about a listed microphone has to start it for a moment to find out what it can do. That
happens on the first call that requires or prefers something other than `default` or a processing that is off.

## Looking at the microphones

```ts
await butler.microphone.list() // never prompts; empty until access has been requested
await butler.microphone.select({ require: { channelCount: 2 } })
await butler.microphone.prepare() // { permission, microphones, selected, error }
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
await using recording = await butler.media.open({
  camera: { require: { facing: 'front' } },
  microphone: { prefer: { echoCancellation: true } },
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
