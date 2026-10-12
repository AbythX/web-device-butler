# Plan: the vocabulary of a butler

The root object is now a `DeviceButler`. This plan looks at whether the rest of the library reads like talking to
one, and proposes where a word should change. The decisions are at the end; what they changed is implemented.

## How it was checked

Every public interface was read as a sentence addressed to the butler (`butler.camera.open()`: "butler, open the
camera") and compared with the words of the three parties:

| Party        | In the library       | Their words                                                |
| ------------ | -------------------- | ---------------------------------------------------------- |
| the employer | the application      | engage, instruct, require, prefer, request, dismiss        |
| the butler   | `DeviceButler`       | prepare, open, close, fetch, announce, watch, keep, forget |
| the guests   | the user of the page | allow, deny, ask, wait                                     |

## What already fits

Most of the library does, and should stay as it is:

| Call                                               | Reads as                                              |
| -------------------------------------------------- | ----------------------------------------------------- |
| `butler.camera.open()`, `session.close()`          | open and close, what a butler does all day            |
| `require: { torch: true }`, `prefer`               | what the employer requires and what they would prefer |
| `butler.permission.request('camera')`              | the butler asks the guest for permission              |
| `butler.location.watch()`, `watch.stop()`          | keeping watch                                         |
| `butler.camera.forget()`                           | discretion                                            |
| `whenBusy: 'wait'`, `allowTakeover`                | someone else is being served                          |
| `MediaInputPreparation`, "it prepares the devices" | the butler prepares                                   |

## Proposed

### 1. `initialize()` becomes `prepare()` (recommended)

`butler.initialize()` is the one call that does not sound like a request to a butler, and it is also misleading as
plain API: it suggests a step that has to run before anything works, while it is optional. The code already calls
it preparing everywhere but in its name: the comments say "prepares the devices", the result of the managers is a
`MediaInputPreparation`, the field in `DefaultDeviceButler` is `prepared`.

| Before                                                     | After                                                |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| `butler.initialize()`                                      | `butler.prepare()`                                   |
| `butler.camera.initialize()`                               | `butler.camera.prepare()`                            |
| `butler.microphone.initialize()`                           | `butler.microphone.prepare()`                        |
| `ButlerInitializeOptions`                                  | `DeviceButlerPrepareOptions`                         |
| `ButlerInitialization`                                     | `DeviceButlerPreparation`                            |
| `CameraInitialization`                                     | `CameraPreparation`                                  |
| `MicrophoneInitialization`                                 | `MicrophonePreparation`                              |
| `camera-initialization.ts`, `microphone-initialization.ts` | `camera-preparation.ts`, `microphone-preparation.ts` |

Touches the three interfaces and their implementations, `BaseMediaInputManager`, the second-tab test commands, the
specs, the README, the getting-started guide and the set-up screen use case. Breaking for applications.

### 2. `dispose()` stays, `dismiss()` is not added (recommended)

"Dispose of the butler" is the one phrase that sounds wrong, and `dismiss()` is the word an employer would use. It
is still better left alone:

- `dispose()` is the name of the language protocol behind `using` and `await using`, which the butler supports.
- Every other object of the library that holds something has `dispose()`, `close()` or `stop()`. A second word for
  the same thing on one object is one more thing to learn.

If the phrase matters more than that, the alternative is `dismiss()` on `DeviceButler` only, with `dispose()` kept
as the protocol name that calls it.

### 3. The prefix of what belongs to the butler (to decide)

The root object is `DeviceButler`, what belongs to it is `Butler...`: `ButlerConfiguration`, `ButlerError`,
`ButlerBindings`, `ButlerContainerModule`, `useButler`, `provideButler`. Two ways to make that one rule:

- **Keep the short prefix** (recommended). `DeviceButler` is the full name of the one object; `Butler...` is the
  short form for the things around it, and `ButlerPreparation` or `useButler()` read better than
  `DeviceButlerPreparation` or `useDeviceButler()`.
- **Use the full name everywhere.** Longer, but nobody has to remember which form applies.

## Looked at and left

| Name                                      | Why it stays                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `DefaultDeviceButler.create()`            | one engages a butler and does not create one, but `create()` is the factory name of every class of the library                           |
| `ButlerConfiguration`                     | "instructions" would be the butler's word, but `CameraConfiguration`, `StorageConfiguration` and `configure()` belong to the same family |
| `butler.storage`, `Store`                 | "pantry" or "cellar" would be a joke that costs every reader a translation                                                               |
| `CameraManager`, `StorageManager`, ...    | staff titles (footman, steward) for the parts: the same cost                                                                             |
| `butler.coordination.isCrossTab`          | the least natural property, but it names a technical fact that has no word in a household                                                |
| `ButlerError`                             | reads as "the butler reports a problem"                                                                                                  |
| events (`change`, `ended`, `statechange`) | named like the events of the browser on purpose; "announce" would hide that                                                              |
| `list()`, `select()`, `query()`           | "present", "choose" and "ask" are no clearer                                                                                             |

The rule behind this list: a butler word is used where it is also the plainest word for what happens. Where the
browser or TypeScript already has a name for something, that name wins, because it is the one a developer searches
for.

## Decided

1. `initialize()` is `prepare()`. The helper of `BaseMediaInputManager` that had the name before is `prepareInput()`.
2. `dispose()` stays and there is no `dismiss()`.
3. What belongs to the butler has the prefix `DeviceButler`: `DeviceButlerConfiguration`, `DeviceButlerError`,
   `DeviceButlerBindings`, `DeviceButlerContainerModule`, `useDeviceButler()`, `provideDeviceButler()`.
4. Everything under "Looked at and left" stays. A word that a developer has to translate is not a goal, at least not
   now.
