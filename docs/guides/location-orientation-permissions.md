# Location, orientation, platform, permissions

The small areas of the device. Try them: `pnpm demo`, page `location/`.

## Location

Nothing is asked of the browser before `current()` or `watch()` is called, because asking shows the permission
prompt.

```ts
butler.location.isSupported // false without HTTPS

const position = await butler.location.current({ highAccuracy: true, timeout: 10_000 })
```

| Option         | Meaning                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `require`      | what a position must have. One without it is never returned or announced.                         |
| `prefer`       | what a position should have. `current()` waits for one that has it, as long as `timeout` allows.  |
| `highAccuracy` | the best position the device can give (GPS instead of the network), which takes longer and uses more power. Default: `false`. |
| `timeout`      | how long determining a position may take, in milliseconds. Default: no limit.                     |
| `maximumAge`   | how old a remembered position may be to count, in milliseconds. Default: `0`, always a new one.   |
| `signal`       | `current()` only: stops waiting; the promise rejects with the reason of the signal                |

### Asking for a position that is good enough

A device answers with the first position it has, and that is often a coarse one from the network before the
receiver has found its satellites. `require` and `prefer` say which positions count. Both take the same traits:

| Trait                          | Meaning                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `accuracy`                     | how far the real position may be from the reported one, in metres  |
| `altitude`, `heading`, `speed` | the position says it. `false` asks for nothing.                    |

```ts
const position = await butler.location.current({
  require: { accuracy: 100 }, // never a position that is further off
  prefer: { accuracy: 10 }, // this, if it arrives in time
  highAccuracy: true,
  timeout: 15_000,
})
```

`current()` then looks through the positions the device reports:

- A position with what is required and what is preferred ends the call at once.
- When the `timeout` has passed, the call resolves with the best position that has what is required.
- If none had it, the call rejects with a `LocationRequirementsError`. Its `position` is the best one that
  arrived, and its message says what that one lacks.
- Without a `timeout` the call does not wait for what is preferred: it resolves with the first position that has
  what is required, and waits for that one until the `signal` aborts it.

This takes longer than a call that asks for nothing, and the receiver of the device runs until the call ends.
`highAccuracy` stays a setting of its own: it is how the browser is asked, and a required accuracy does not switch
it on.

The `location` section of the configuration takes the same options as the defaults of every call:

```ts
const butler = DefaultDeviceButler.create({ location: { require: { accuracy: 100 }, highAccuracy: true } })
```

A `DevicePosition` is immutable:

```ts
position.latitude // degrees, north is positive
position.longitude // degrees, east is positive
position.accuracy // metres
position.timestamp // milliseconds since 1970
position.altitude // metres; undefined where the device cannot tell
position.heading // degrees clockwise from north; undefined while the device does not move
position.speed // metres per second

position.distanceTo(other) // metres along the surface of the earth
position.satisfies({ accuracy: 10 }) // whether it has these traits
position.missing({ accuracy: 10, speed: true }) // the ones it lacks, in words
```

What a device cannot tell is `undefined`, never `null` or `NaN`.

### Following the device

```ts
using watch = butler.location.watch({ highAccuracy: true })

watch.on('position', (position) => {})
watch.on('error', (error) => {})

watch.position // the latest one; undefined until the first arrived
watch.isActive
watch.stop()
```

A watch only announces positions that have what it requires: `watch({ require: { accuracy: 50 } })` leaves out
the coarse ones. What is preferred does not filter; `position.satisfies()` tells whether a position has it.

Problems arrive as `error` events instead of exceptions, because a watch outlives the call that started it:

| Error                      | The watch                                                       |
| -------------------------- | --------------------------------------------------------------- |
| `LocationUnavailableError` | goes on; the next position may arrive                           |
| `LocationTimeoutError`     | goes on                                                         |
| `PermissionDeniedError`    | has stopped: `isActive` is `false` when the listener is called  |

`butler.location.dispose()` and `butler.dispose()` stop every watch. See
[recording a route](../use-cases/track-a-route.md).

## Orientation

```ts
butler.orientation.current // 'portrait' | 'landscape'; undefined where there is no page
butler.orientation.isPortrait
butler.orientation.on('change', (orientation) => {})
```

It follows the shape of the page, not a sensor: a desktop window that is made narrow counts as portrait. That is the
question a layout asks. It is not the rotation of the phone in degrees, and it needs no permission. For the same
reason a phone that is held upright can report `landscape` while its keyboard is open: the keyboard leaves the page
wider than tall.

`butler.orientation.lock('landscape')` keeps the page from turning, which most browsers only do for a page that
fills the screen. See [filling the screen](screen-network-sharing.md#keeping-the-page-from-turning).

## Platform

```ts
butler.platform.isIos // an iPhone or an iPad, whatever browser runs on it
butler.platform.isAndroid
```

The library uses it to choose the workarounds a platform needs. An application rarely should: ask for the feature
instead of the platform (`session.torch !== undefined`, `store.capabilities.streaming`). It is there for what has
no feature to ask for, such as showing the right instructions for unblocking a permission.

An iPad that says it is a Mac is recognised; a desktop browser that simulates a phone is not taken for one.

## Permissions

One place to ask about every permission, so a permission screen does not have to know how each browser handles each
one.

```ts
await butler.permission.query('camera') // never asks the user, never rejects
await butler.permission.request('geolocation') // asks where the browser has to
butler.permission.on('change', ({ name, state }) => {})
```

The names: `'camera'`, `'microphone'`, `'geolocation'`, `'persistent-storage'`, `'clipboard-read'`,
`'screen-wake-lock'`.

| State         | Meaning                                                                          | A permission screen shows          |
| ------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| `granted`     | allowed                                                                          | a check mark                       |
| `prompt`      | the browser asks the user when the permission is requested                       | a button that calls `request()`    |
| `unknown`     | this browser cannot tell before the permission is requested                      | the same button                    |
| `denied`      | the user or the browser refused                                                  | how to unblock it in the browser   |
| `unsupported` | what the permission is for does not exist here, for example a camera without HTTPS | that the feature is not available |

- **A refusal is a state, not an error.** `request()` resolves with `'denied'`.
- **`denied` is sticky.** Asking again shows no prompt in most browsers; the user has to unblock the permission in
  the settings of the browser. Do not offer a "try again" button that cannot work.
- `request('camera')` starts a camera for a moment, because that is the only way to make a browser ask. It requests
  the side that is configured; `request('camera', { facing: 'front' })` names one. While the camera is held, it
  rejects with a `MediaDeviceBusyError`.
- `request('clipboard-read')` reads the clipboard once, and `request('screen-wake-lock')` keeps the screen on for
  a moment, because using the feature is the only way to find out.
- `request('persistent-storage')` is `butler.storage.persist()` as a permission. Whether the user is asked is up to
  the browser: some decide by themselves, by how much the site is used.

For the camera and the microphone, [`butler.prepare()`](../use-cases/set-up-screen.md) requests the permission
and finds the device in one step.
