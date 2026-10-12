# Errors

Every error the library throws extends `DeviceButlerError`. Each sets `name` (so it survives a minifier and a log) and
keeps the error of the browser as `cause`. The names of `DOMException` (`NotAllowedError`, `NotReadableError`,
`OverconstrainedError`, ...) never reach the application: what they mean differs between browsers, and sorting that
out is the job of the library.

```ts
import { DeviceButlerError, MediaDeviceBusyError, PermissionDeniedError } from 'web-device-butler'

try {
  session = await butler.camera.open()
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    showHowToUnblock(error.permission)
  } else if (error instanceof MediaDeviceBusyError) {
    showBusy(error.holder)
  } else if (error instanceof DeviceButlerError) {
    showGenericProblem(error)
  } else {
    throw error // not from the library: a bug
  }
}
```

A `TypeError` from the library means the code calls it wrongly (a store without a namespace, a driver name that is
not registered). It is not a `DeviceButlerError` on purpose: there is nothing to tell the user.

A call that was aborted through its `signal` rejects with the reason of the signal, as `fetch` does.

## Everywhere

| Error                   | Thrown when                                                    | Fields       | Tell the user                                              |
| ----------------------- | -------------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| `PermissionDeniedError` | the user or the browser refused                                | `permission` | how to unblock it in the settings of the browser. Asking again shows no prompt in most browsers. |
| `UnsupportedError`      | the browser or the page (no HTTPS) does not have what was asked for | `feature` | that the feature is not available here; hide it next time  |

## Camera and microphone

All extend `MediaError`. A `MediaError` itself is thrown for what fits none of them, and for a camera or microphone
that is asked for after its butler was disposed.

| Error                      | Thrown when                                              | Fields                                         | What to do                                                        |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `MediaDeviceBusyError`     | the device is held and `whenBusy` does not get it        | `kind`, `holder`: `'this-tab'`, `'other-tab'`, `'unknown'` | `other-tab`: offer `whenBusy: 'takeover'`. `unknown`: another application has it; ask the user to close it. |
| `MediaRequirementsError`   | no device can deliver what was required                  | `constraint`, where the browser names one      | the message says which requirement removed which device. Loosen `require`, or say that the device lacks the feature. |
| `MediaDeviceNotFoundError` | there is no device of the kind, or none with the id      |                                                | say that there is no camera; forget a stored id                   |
| `SessionClosedError`       | something was asked of a session that has ended          |                                                | open a new session. Listen to `ended` to know earlier.            |

`prepare()` of the butler, the camera and the microphone does not throw these: it reports them as `error` of its
result, so a set-up screen can go on without a camera.

## Location

Both extend `LocationError`.

| Error                      | Thrown when                                   | What to do                                           |
| -------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| `LocationUnavailableError` | the device cannot tell where it is            | try again later, or without `highAccuracy`           |
| `LocationTimeoutError`     | it took longer than `timeout` allows          | try again with a longer `timeout` or a `maximumAge`  |

A watch reports them as `error` events and goes on.

## Storage

All extend `StorageError`. A `StorageError` itself is thrown for what fits none of them, and for a key that is too
long for the file system of `opfs`.

| Error                       | Thrown when                                                                   | Fields                       | What to do                                              |
| --------------------------- | ----------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `StorageQuotaExceededError` | a write did not fit                                                           | `space`, if it could be read | free something, tell the user                           |
| `StorageLockedError`        | the entry is in use and the call was made with `{ wait: false }`              | `key`                        | try later, or wait                                      |
| `StorageUnsupportedError`   | none of the drivers works here, or the driver cannot do it (streams)          |                              | add a driver to the chain; check `capabilities` first   |
| `StorageAccessDeniedError`  | the browser refused the backend, for example in private mode                  |                              | fall back to another driver, finally `memory`           |
| `StorageCodecError`         | a value could not be encoded, or what is stored could not be decoded or validated |                          | treat the entry as missing; delete or migrate it        |
| `StorageVersionError`       | the entry was written by a newer version of the library, typically in another tab after a deployment | `key`, `found`, `supported` | ask the user to reload. The entry is untouched. |

## Events instead of errors

What happens after a call has returned cannot be thrown. It arrives as an event:

| Event                         | Means                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| session `ended`               | `reason` says why: `'closed'`, `'taken-over'`, `'device'`                   |
| session `statechange` to `muted` | the system paused the device; it may come back                           |
| watch `error`                 | a position could not be determined                                          |
| storage space watch `low`     | less than `lowBelow` bytes are available                                    |

## States instead of errors

A refusal is an expected answer, so where the question is "may I?", the answer is a value:

- `butler.permission.query()` and `request()` resolve with `'denied'` or `'unsupported'`.
- `butler.camera.requestAccess()` resolves with the access state.
- `butler.storage.space()` never rejects; `space.isKnown` is `false` where the browser gives no estimate.
- `butler.storage.isSupported(driver)` resolves with `false`.
