# Plan: one place per area that reads what the browser failed with

[The errors guide](../guides/errors.md) promises that the names of `DOMException` never reach the application, and
that sorting out what they mean is the job of the library. Four areas keep that promise in one place, an error
factory: location, media, sharing and storage. The others read the names where they call the browser, and the
two meanings every area shares, "the user or the browser said no" and "the user closed the dialog", are spelled out
again in each.

After this change every check of a name of the browser lives in the error factory of its area, and the shared
meanings live in `BrowserError`. Plain wraps without a check of a name, such as
`new MediaError('Could not take a photo', { cause })`, stay where they are: they already translate everything the
same way.

Not implemented yet. Nothing changes in the public API, and every error keeps its class, its `permission` and its
message.

## Review: what is there today

### Already in a factory

| Area | Factory | Asked by |
| ---- | ------- | -------- |
| Location | `LocationErrorFactory.from` | location, location watch, geolocation requester (`instanceof PermissionDeniedError`) |
| Media | `MediaErrorFactory.from`, `isOverconstrained` | media access, constraint queue, screen capture |
| Sharing | `SharingErrorFactory.from`, `isCancellation` | share, clipboard |
| Storage | `StorageErrorFactory.from`, `isNotFound` | the drivers, the store |

### Read where the browser is called

| Where | Checks | Turns it into |
| ----- | ------ | ------------- |
| `screen/wake-lock/default-screen-wake-lock.ts:118` | `NotAllowedError` | `PermissionDeniedError('screen-wake-lock')`, otherwise `ScreenError` |
| `platform/default-device-orientation.ts:60` | `NotSupportedError` | `UnsupportedError('orientation lock')`, otherwise `ScreenError` |
| `screen/fullscreen/default-screen-fullscreen.ts:95,112` | nothing | `ScreenError` (a plain wrap; listed because the screen has no factory) |
| `files/default-device-files.ts:48` | `AbortError` | the outcome `cancelled` |
| `files/default-device-files.ts:63` | nothing | `FileError` (a plain wrap) |
| `media/output/default-audio-output-manager.ts:77` | `NotAllowedError` | `undefined`: the user closed the list |
| `media/output/default-audio-output-manager.ts:95` | `NotFoundError`, `NotAllowedError` | `MediaDeviceNotFoundError`, `PermissionDeniedError('speaker-selection')`, otherwise `MediaError` |
| `media/screen-capture/default-screen-capture-manager.ts:144` | `InvalidStateError`, `InvalidAccessError`, `NotAllowedError` without a click | `MediaError` "has to be called in answer to a click", otherwise `MediaErrorFactory.from` |
| `permission/requesters/clipboard-read-permission-requester.ts:36` | `NotAllowedError` | the state `denied`; the geolocation requester asks its factory instead |
| `storage/drivers/indexed-db/indexed-db-storage-driver.ts:204` | `InvalidStateError` | opens the connection again; the OPFS driver asks `StorageErrorFactory.isNotFound` for the same kind of question |

### The shared meanings, spelled out in each

| Meaning | Name | Spelled out in |
| ------- | ---- | -------------- |
| the user or the browser said no | `NotAllowedError` | media factory (with `SecurityError`), sharing factory, wake lock, audio output, clipboard requester |
| the user closed the dialog | `AbortError` | sharing factory, files |

The audio output is the exception: closing its list rejects with `NotAllowedError`, which is a cancellation there,
not a refusal. That stays a rule of its own, in the media factory.

## Design

### `BrowserError` names the shared meanings

```ts
/** the user or the browser said no (`NotAllowedError`) */
public static isRefusal(error: unknown): boolean

/** the user closed what the browser showed without choosing (`AbortError`) */
public static isCancellation(error: unknown): boolean
```

`BrowserError` stays the place that reads the shape of what the browser threw; a factory decides what it means for
its area. The media factory keeps `SecurityError` next to `isRefusal`, and the storage factory keeps its own list of
names for a denied access, because they are rules of those areas.

### A factory for every area that checks a name

| Factory | New or changed | Methods | Asked by |
| ------- | -------------- | ------- | -------- |
| `ScreenErrorFactory` | new, `screen/errors/` | `from(error, action, { permission?, feature? })`: a refusal becomes `PermissionDeniedError(permission)` where a permission is given, `NotSupportedError` becomes `UnsupportedError(feature)` where a feature is given, anything else `ScreenError(action)`. Each caller names only what it maps today, so nothing else changes. | wake lock, fullscreen, orientation lock |
| `FileErrorFactory` | new, `files/errors/` | `from(error, action)`, `isCancellation(error)` | files |
| `MediaErrorFactory` | changed | `fromAudioOutput(error, action, id?)`, `isOutputChoiceCancelled(error)`, `fromScreenCapture(error, wasActivated)`; `from` uses `isRefusal` | audio output, screen capture |
| `SharingErrorFactory` | changed | `from` and `isCancellation` use the shared meanings | share, clipboard, clipboard read requester |
| `StorageErrorFactory` | changed | `isClosedConnection(error)` | IndexedDB driver |
| `LocationErrorFactory` | unchanged | reads a numeric `code`, not a name | |

- A requester asks the factory of its area, as the geolocation requester does today: the clipboard read requester
  turns `SharingErrorFactory.from(error, 'clipboard', …) instanceof PermissionDeniedError` into `denied`.
- The orientation lock lives in `platform/` but already throws the `ScreenError` of `screen/`; it asks
  `ScreenErrorFactory` the same way.
- Afterwards `BrowserError` is only asked by the factories. A spec of each factory covers the names it reads.

## Left as it is

What a cancelled dialog resolves with differs between the calls, and stays: each answer fits the return type of its
call, and all of them are documented.

| Call | The user closes the dialog |
| ---- | -------------------------- |
| `share()` | resolves with `false` |
| `files.save()` | resolves with `'cancelled'` |
| `files.pick()` | resolves with `[]` |
| `audioOutput.choose()` | resolves with `undefined` |
| `screenCapture.open()` | rejects with `PermissionDeniedError('display-capture')`, because Chromium rejects a cancelled picker with the same `NotAllowedError` as a refusal and the library cannot tell them apart |

## Steps

One commit each; every step leaves the specs green.

1. `BrowserError.isRefusal` and `isCancellation`, with specs.
2. The sharing factory uses them; the clipboard read requester asks the factory.
3. `ScreenErrorFactory` with a spec; the wake lock, the fullscreen and the orientation lock ask it.
4. `FileErrorFactory` with a spec; the files ask it.
5. `MediaErrorFactory.fromAudioOutput`, `isOutputChoiceCancelled` and `fromScreenCapture`; the audio output and the
   screen capture ask them, and `from` uses `isRefusal`.
6. `StorageErrorFactory.isClosedConnection` for the IndexedDB driver.

## Decisions

| Decision | Recommendation |
| -------- | -------------- |
| A factory per area, or one factory in `core` for all? | **Per area**, as the four that exist. The meanings differ between the areas (the audio output cancels with `NotAllowedError`); `core` only names what they share. |
| Make the cancelled dialogs answer the same way everywhere? | **No, not now.** It changes the public API, and the screen capture cannot tell a cancellation from a refusal in Chromium. A plan of its own if it is wanted. |
| Move the plain wraps (fullscreen, files, recording, photo, listing the outputs) into the factories too? | **Only where the area gets a factory anyway**: the fullscreen into `ScreenErrorFactory`, writing a file into `FileErrorFactory`, listing the outputs into `fromAudioOutput`. The recording and the photo stay plain wraps of `MediaError`. |
