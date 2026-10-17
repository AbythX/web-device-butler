# Location, orientation, motion, platform, permissions

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

## Motion and heading

`butler.motion` reads the sensors: how the device is turned, where it points, and how it moves. For a spirit level,
a compass, a picture that follows the device, or a shake.

```ts
// Safari on iOS reports nothing until the user allowed it, which it asks only in answer to a click
button.onclick = () => butler.permission.request('motion')

using attitude = butler.motion.watchAttitude({ rate: 30 })
attitude.on('change', ({ pitch, roll, heading }) => {
  level.draw(pitch, roll)
  compass.point(heading) // undefined where the device cannot tell north
})

using motion = butler.motion.watchMotion()
motion.on('change', ({ acceleration, accelerationIncludingGravity, rotationRate }) => {})
```

Every value is for the **screen as it is held**: the same whether a phone is held upright or sideways. The browser
reports its angles in the frame of the device held the natural way, and leaves turning them to the page; the
library does that with the angle of the screen.

| Value     | Meaning                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------- |
| `pitch`   | the turn around the axis of the screen from left to right: `0` flat with the screen up, `90` upright facing the user, more when tilted back further. -180 to 180. |
| `roll`    | how far the right edge of the screen is below the horizon, what a spirit level shows. -90 to 90. While the device is pitched it is smaller than the browser's `gamma`. |
| `heading` | degrees clockwise from north: where the top edge of the screen points while the device lies more flat than upright, where its back points while it is held more upright. Taken from the compass of Safari, and from the event `deviceorientationabsolute` of Chromium. |
| `raw`     | `alpha`, `beta`, `gamma` and `absolute`, as the browser reported them                           |

The movement has `acceleration` (without gravity, where the device can separate it),
`accelerationIncludingGravity` (a device lying still has 9.8 along `z`) and `rotationRate` in degrees per second,
each with `x` to the right edge of the screen, `y` to its top edge and `z` out of the screen towards the user.

- `rate` limits how many values per second are reported. A device measures up to 60 times per second, and a page
  that redraws on each one has little time for anything else. The last value is always reported.
- A watch says `unavailable` once when the device reports nothing: a desktop sends one event without values, and
  Safari sends nothing before the permission is granted. `watch.isAvailable` tells the same. Values that arrive
  later are reported as usual.
- `butler.motion.isSupported` is `false` where the browser has no events for the sensors, or the page was not loaded
  over HTTPS. A desktop browser has the events and no sensors.
- `butler.prepare({ motion: true })` requests the permission, which in Safari has to be in answer to a click.

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
`'screen-wake-lock'`, `'motion'`.

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
- `request('motion')` asks the user in Safari on iOS, for both sensors in one click; outside a click Safari does not
  ask, and the state stays `prompt`. Chromium knows the sensors as permissions it grants without asking, and
  Firefox does not ask at all; both report `granted`.
- `request('persistent-storage')` is `butler.storage.persist()` as a permission. Whether the user is asked is up to
  the browser: some decide by themselves, by how much the site is used.

For the camera and the microphone, [`butler.prepare()`](../use-cases/set-up-screen.md) requests the permission
and finds the device in one step.
