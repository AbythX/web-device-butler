# Migrating to `require` and `prefer`

What an application asks of a camera or a microphone is written in one shape now: every property goes into
`require` (the device must have it) or into `prefer` (it should). The fields that stood next to them are gone, and
they were removed without a period in which both worked. The compiler finds every place: the old fields are no
longer part of the types.

Storage and location only gained fields. Nothing that was written for them before has to change.

## Camera

| Before                                         | After                                             |
| ---------------------------------------------- | ------------------------------------------------- |
| `facing: 'back'`                               | `require: { facing: 'back' }`                     |
| `resolution: { width, height }`                | `prefer: { width, height }`                       |
| `resolution: { width, height, mode: 'exact' }` | `require: { width, height }`, see below           |
| `require: { minResolution: { width, height } }` | `require: { width, height }`                     |
| `prefer: { minResolution: { width, height } }` | `prefer: { width, height }`                       |
| `frameRate: 30`                                | `prefer: { frameRate: 30 }`                       |
| `require: { minFrameRate: 30 }`                | `require: { frameRate: 30 }`                      |
| `session.configure({ resolution: { width, height } })` | `session.configure({ width, height })`    |
| `session.switchTo({ facing: 'front', require: {} })` | `session.switchTo({ require: { facing: 'front' } })` |
| the types `CameraFeatureRequirements`, `ResolutionRequirement` | `CameraTraits`                    |

Three things behave differently:

- **`mode: 'exact'` is gone.** A required width and height are checked against what the camera says it can
  deliver, and the camera is then asked for the closest it can do. Where the browser has to refuse anything else,
  write the constraint yourself: `constraints: { width: { exact: 1920 }, height: { exact: 1080 } }`.
- **A call that names `require` replaces what the configuration requires**, the side included, because the side is
  part of `require` now. `open({ require: { torch: true } })` no longer keeps a configured `facing`; write
  `open({ require: { facing: 'back', torch: true } })`. The same holds for `prefer` and a configured width and
  height.
- **A side can be preferred.** `prefer: { facing: 'back' }` takes a back camera where there is one and any other
  camera otherwise, which the old `facing` could not say.

## Microphone

| Before                                         | After                                             |
| ---------------------------------------------- | ------------------------------------------------- |
| `processing: { noiseSuppression: true }`       | `prefer: { noiseSuppression: true }`              |
| `processing: { echoCancellation: false }`      | `prefer: { echoCancellation: false }`             |
| `channelCount: 2`                              | `prefer: { channelCount: 2 }`                     |
| `sampleRate: 48000`                            | `prefer: { sampleRate: 48000 }`                   |
| `require: { minChannelCount: 2 }`              | `require: { channelCount: 2 }`                    |
| the types `MicrophoneFeatureRequirements`, `MicrophonePreferences` | `MicrophoneTraits`            |

Two things behave differently:

- **A processing that is `true` is also switched on.** `require: { noiseSuppression: true }` used to mean "the
  microphone has it" and left the switch to `processing`. It now also starts the session with it on. To get a
  microphone that has it and start with it off, call `session.processing.set({ noiseSuppression: false })` after
  `open()`.
- **A preferred processing can start microphones for a moment** on the first call, in a browser that says nothing
  about a listed microphone. `processing` did not do that, because it did not take part in choosing the microphone.

`MicrophoneProcessing` is still the type of what `session.processing.set()` takes.

## Storage

Nothing has to change. `driver` is optional now, and `require` and `prefer` are new; see
[Letting the library choose](storage.md#letting-the-library-choose).

The message of a `StorageUnsupportedError` changed: it says what each backend lacks instead of listing the names.

## Location

Nothing has to change in the calls. `require` and `prefer` are new; see
[Asking for a position that is good enough](location-orientation-permissions.md#asking-for-a-position-that-is-good-enough).

`DefaultDeviceLocation.create()` takes the configuration as its first argument, like the other managers:
`DefaultDeviceLocation.create({}, environment, logger)`.

## `prepare()`

`butler.prepare()` without options now also prepares the storage and the location of an application that has a
section for them in its configuration. Its result has a `storage` and a `location` entry then.
