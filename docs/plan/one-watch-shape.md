# Plan: one shape for the watches

Three calls start something that follows a value of the device until the application stops it: `location.watch()`,
`motion.watchAttitude()` / `watchMotion()` and `storage.watchSpace()`. They do the same job and name it three ways:

```ts
locationWatch.position // the latest value
locationWatch.on('position', …) // a new value
attitudeWatch.current
attitudeWatch.on('change', …)
spaceWatch.current
spaceWatch.on('change', …)
spaceWatch.dispose() // the others: stop()
```

After this change they share one shape, `Watch<Value>`: `current`, `isActive`, `stop()` and a `change` event, and each
adds what only it has: `error` for the location, `unavailable` and `isAvailable` for the sensors, `low` and
`refresh()` for the space.

The gain is modest: three names to learn instead of seven, a space watch that can tell whether it runs, and a
registry that ends every watch the same way. It changes the public API, which the package at `0.0.0` can still
afford.

Not implemented yet.

## Review: what is there today

### The watches

| | Value | New value | Runs? | Ended by | Own events and fields |
| - | ----- | --------- | ----- | -------- | --------------------- |
| `LocationWatch` | `position` | `position` | `isActive` | `stop()`, `using` | `error` |
| `MotionWatch<Value>` | `current` | `change` | `isActive` | `stop()`, `using` | `unavailable`, `isAvailable` |
| `StorageSpaceWatch` | `current` | `change` | — | `dispose()`, `using` | `low`, `refresh()` |

`WatchRegistry` is told by each part how to end its watches: `(watch) => watch.stop()` twice, `(watch) =>
watch.dispose()` once.

### Not watches: values of the parts of the butler

These follow a value too, but the application does not start or stop them; they live as long as the butler and
are disposed with it. Each names its value after what it is, and each announces it with `change`, except one:

| Part | Value | Event |
| ---- | ----- | ----- |
| `butler.network` | `isOnline`, `connection` | `change`, `connectionchange` |
| `butler.orientation` | `current` | `change` |
| `butler.page` | `state` | `change` |
| `butler.fullscreen` | `element` | `change` |
| `butler.wakeLock` | `isActive` | `change` |
| level meter of a microphone session | `level` | `change` |
| `butler.audioOutput` | the list, from `list()` | `change` |

They stay as they are: `isOnline` and `element` say more than `current` would, and they already agree on `change`.

The code scan (`scanner.scan()`) is started and stopped too, but it reports codes, not a value that changes, and
stops asynchronously. It stays as it is.

## Design

```ts
// core/lifetime/watch.ts
export interface WatchEvents<Value> {
  /** a new value; also the first one */
  change: Value
}

/**
 * Follows a value of the device until it is stopped. Created by a part of the butler, never by the application.
 */
export interface Watch<Value, Events extends WatchEvents<Value> = WatchEvents<Value>>
  extends Listenable<Events>, Disposable {
  /** `false` once the watch has stopped, by the application or by itself */
  readonly isActive: boolean
  /** the latest value; `undefined` until the first one arrived */
  readonly current: Value | undefined
  /** stops following the value and forgets every listener; stopping a watch that has stopped does nothing */
  stop(): void
}
```

| Watch | Becomes |
| ----- | ------- |
| `LocationWatch` | `Watch<DevicePosition, LocationWatchEvents>`: `position` becomes `current`, the event `position` becomes `change`; `error` stays |
| `MotionWatch<Value>` | `Watch<Value, MotionWatchEvents<Value>>`: nothing changes but the declaration |
| `StorageSpaceWatch` | `Watch<StorageSpace, StorageSpaceWatchEvents>`: `dispose()` becomes `stop()`, `isActive` is new; `low` and `refresh()` stay |

- `WatchRegistry<Tracked extends Watch<unknown>>` ends a watch with `stop()` itself; the parts no longer pass how.
- No aliases for the old names: a deprecated `position` next to `current` would keep two names for the same thing in
  the API this plan wants to shorten. The guide below says what to rename.

### Adapters

`LocationController` follows `change` instead of `position`. The snapshots of the hooks keep their names:
`useLocation()` returns `position`, `useAttitude()` returns `value`, because a component reads better with them and
they are not watches. There is no hook of the space watch.

### Documentation

| File | What changes |
| ---- | ------------ |
| `README.md`, `docs/guides/location-orientation-permissions.md`, `docs/use-cases/track-a-route.md` | `watch.position` and `on('position')` |
| `docs/guides/storage.md`, `docs/use-cases/voice-memo.md` | nothing: they end the space watch with `using`, which stays; the guide gains a line on `stop()` and `isActive` |
| `docs/guides/errors.md` | nothing: the event `error` of a watch keeps its name |
| `demo/location/main.ts:112` | `on('position')` |
| `demo/storage/main.ts:248`, `demo/use-cases/voice-memo/main.ts:121` | `dispose()` of the space watch |
| new `docs/guides/migrating-to-one-watch.md` | the three renames, like `migrating-to-require-and-prefer.md` |

## Steps

One commit each; every step leaves the specs green.

1. `Watch` and `WatchEvents` in `core/lifetime/watch.ts`; `MotionWatch` declared with them.
2. `LocationWatch`: `current` and `change`; the location controller and the specs follow.
3. `StorageSpaceWatch`: `stop()` and `isActive`; the storage manager and the specs follow.
4. `WatchRegistry` ends a watch with `stop()`; the three parts drop their callback.
5. The guides, the use cases, the demos and the README; the migration guide.

## Decisions

| Decision | Recommendation |
| -------- | -------------- |
| Bring the values of the parts (network, orientation, page, fullscreen, wake lock) into the same shape? | **No.** They are not started or stopped by the application, their names say what the value is, and they already agree on `change`. |
| Keep the old names as deprecated aliases? | **No.** The package is at `0.0.0`; the migration guide covers the renames. |
| Rename the snapshots of the hooks too (`useLocation().position` → `current`)? | **No.** A hook returns state of a component, not a watch, and `position` says what it is. |
| `connectionchange` of the network: fold it into `change`? | **No, not in this plan.** `change` carries `isOnline` and `connectionchange` the connection; merging them changes what a listener receives. |
