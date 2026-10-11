# Location, orientation, platform, permissions

The small areas of the device. Try them: `pnpm demo`, page `location/`.

## Location

Nothing is asked of the browser before `current()` or `watch()` is called, because asking shows the permission
prompt.

```ts
device.location.isSupported // false without HTTPS

const position = await device.location.current({ highAccuracy: true, timeout: 10_000 })
```

| Option         | Meaning                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `highAccuracy` | the best position the device can give (GPS instead of the network), which takes longer and uses more power. Default: `false`. |
| `timeout`      | how long determining a position may take, in milliseconds. Default: no limit.                     |
| `maximumAge`   | how old a remembered position may be to count, in milliseconds. Default: `0`, always a new one.   |
| `signal`       | `current()` only: stops waiting; the promise rejects with the reason of the signal                |

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
```

What a device cannot tell is `undefined`, never `null` or `NaN`.

### Following the device

```ts
using watch = device.location.watch({ highAccuracy: true })

watch.on('position', (position) => {})
watch.on('error', (error) => {})

watch.position // the latest one; undefined until the first arrived
watch.isActive
watch.stop()
```

Problems arrive as `error` events instead of exceptions, because a watch outlives the call that started it:

| Error                      | The watch                                                       |
| -------------------------- | --------------------------------------------------------------- |
| `LocationUnavailableError` | goes on; the next position may arrive                           |
| `LocationTimeoutError`     | goes on                                                         |
| `PermissionDeniedError`    | has stopped: `isActive` is `false` when the listener is called  |

`device.location.dispose()` and `device.dispose()` stop every watch. See
[recording a route](../use-cases/track-a-route.md).

## Orientation

```ts
device.orientation.current // 'portrait' | 'landscape'; undefined where there is no page
device.orientation.isPortrait
device.orientation.on('change', (orientation) => {})
```

It follows the shape of the page, not a sensor: a desktop window that is made narrow counts as portrait. That is the
question a layout asks. It is not the rotation of the phone in degrees, and it needs no permission. For the same
reason a phone that is held upright can report `landscape` while its keyboard is open: the keyboard leaves the page
wider than tall.

## Platform

```ts
device.platform.isIos // an iPhone or an iPad, whatever browser runs on it
device.platform.isAndroid
```

The library uses it to choose the workarounds a platform needs. An application rarely should: ask for the feature
instead of the platform (`session.torch !== undefined`, `store.capabilities.streaming`). It is there for what has
no feature to ask for, such as showing the right instructions for unblocking a permission.

An iPad that says it is a Mac is recognised; a desktop browser that simulates a phone is not taken for one.

## Permissions

One place to ask about every permission, so a permission screen does not have to know how each browser handles each
one.

```ts
await device.permission.query('camera') // never asks the user, never rejects
await device.permission.request('geolocation') // asks where the browser has to
device.permission.on('change', ({ name, state }) => {})
```

The names: `'camera'`, `'microphone'`, `'geolocation'`, `'persistent-storage'`.

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
- `request('persistent-storage')` is `device.storage.persist()` as a permission. Whether the user is asked is up to
  the browser: some decide by themselves, by how much the site is used.

For the camera and the microphone, [`device.initialize()`](../use-cases/set-up-screen.md) requests the permission
and finds the device in one step.
