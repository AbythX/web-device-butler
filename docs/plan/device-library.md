# Plan: web-device-butler, a standalone device library

Status: phases 0, 1 and 2 are implemented.
Phase 3 is implemented and tested against fakes and the fake cameras of the browsers; its "done when" on the
reference phones is open (see [Phase 3](#phase-3-camera)). Phase 4 is implemented and tested the same way (see
[Phase 4](#phase-4-microphone)). Phases 5 and 6 are implemented as far as this repository goes (see
[Phase 6](#phase-6-adapters-and-documentation)). Where the implementation deviates from this plan,
[Implementation notes](#implementation-notes) say how and why; the notes win over the text they refer to. Written
2026-10-10.

## Goal

One library that hides the incidental complexity of browser APIs that are tied to the device, so an application says
_what_ it needs and not _how_ the browser provides it.

Two areas drive the first version:

1. **Storage**: one interface, several backends (local, session, OPFS, IndexedDB, memory, more later).
2. **Media input**: one way to get a camera or a microphone, including choosing a device by the features it has
   ("a back camera with a torch"), not by guessing a `deviceId`.

Location, orientation and platform are the small areas next to them.

## Design principles

- **Object-oriented throughout.** The public API consists of classes. There are no free functions: objects are
  created through constructors or static factory methods (`Device.create()`), behaviour lives on the object that owns
  the state, and variation is expressed through abstract base classes and polymorphism (one `StorageDriver` subclass
  per backend, one `MediaSession` subclass per input kind).
- **Interfaces for contracts, classes for behaviour.** Extension points that an application implements (`Logger`,
  `Codec`) are interfaces. Arguments that only carry data (configuration, requirements, options) are plain objects
  typed by interfaces, so call sites stay readable; they have no behaviour of their own.
- **Composition over deep inheritance.** Inheritance is used where there is a real "is a" (`CameraSession` is a
  `MediaSession`). Platform differences and optional features are composed in (quirks, controls), not subclassed.
- **Framework-agnostic core, zero runtime dependencies.** Vue, inversify and fabric are optional sub-path exports.
- **Capability-driven.** Every object reports what the current browser and device can do. Unsupported features are
  absent from the type (`session.torch` is `TorchControl | undefined`), not methods that silently do nothing.
- **No side effects on import, no permission prompt without an explicit call.** SSR-safe.
- **Constructor injection.** Each class receives its collaborators and browser dependencies through its constructor
  (`DeviceEnvironment`, `Logger`), so tests run against fakes. `Device.create()` is the composition root that wires
  the real ones.
- **Safe with several tabs.** The same application open in more than one tab must not corrupt stored data or fight
  over the camera. Every access to a shared resource is coordinated across tabs (see
  [Multiple tabs](#multiple-tabs)).
- **One error hierarchy.** `DOMException` names never reach the consumer.
- **Explicit lifetime.** Every class that holds a resource implements `Disposable` / `AsyncDisposable`.

## Package layout

```
src/
  core/         Device, DeviceEnvironment, DeviceError, EventEmitter, Logger, CrossTabLock, CrossTabChannel
  permission/   PermissionManager
  media/        MediaAccess, MediaInputManager, MediaInputDescriptor, MediaSession, TrackControl, PlatformQuirk
    camera/     CameraManager, CameraDescriptor, CameraProber, CameraSelector, CameraSession, TorchControl, ZoomControl, FocusControl
    microphone/ MicrophoneManager, MicrophoneDescriptor, MicrophoneSession, ProcessingControl, LevelMeter
  storage/      StorageManager, Store, StorageDriver + one subclass per backend, Codec implementations
  location/     DeviceLocation
  platform/     DevicePlatform, DeviceOrientation
  index.ts      exports
adapters/
  vue/          composables (useCamera, useStorage, ...)
  inversify/    ContainerModule
  fabric/       a canvas renderer for a camera (see open decisions)
```

Published as ESM with sub-path exports (`web-device-butler`, `web-device-butler/storage`, `web-device-butler/camera`, `web-device-butler/vue`, ...) so a consumer that only
wants storage does not pull in media code.

### Class overview

```
Device                                   root object, created by Device.create()
├─ storage      : StorageManager         opens Store instances, owns the StorageDriver registry
├─ camera       : CameraManager          extends MediaInputManager<CameraDescriptor, CameraSession>
├─ microphone   : MicrophoneManager      extends MediaInputManager<MicrophoneDescriptor, MicrophoneSession>
├─ media        : MediaManager           combined camera + microphone sessions
├─ permission   : PermissionManager
├─ coordination : TabCoordination        reports whether cross-tab locking is available
├─ location     : DeviceLocation
├─ platform     : DevicePlatform
└─ orientation  : DeviceOrientation

abstract StorageDriver                   abstract MediaInputDescriptor       abstract MediaSession
├─ LocalStorageDriver                    ├─ CameraDescriptor                 ├─ CameraSession
├─ SessionStorageDriver                  └─ MicrophoneDescriptor             ├─ MicrophoneSession
├─ OpfsStorageDriver                                                         └─ CombinedMediaSession
├─ IndexedDbStorageDriver                abstract TrackControl
└─ MemoryStorageDriver                   ├─ TorchControl                     abstract PlatformQuirk
                                         ├─ ZoomControl                      └─ IosTorchResetsOnZoomQuirk, ...
interface Codec<T>                       ├─ FocusControl
├─ JsonCodec<T>                          └─ ProcessingControl                abstract DeviceError
├─ TextCodec                                                                 └─ see the error tables
└─ BinaryCodec
```

`EventEmitter<Events>` is the typed base class of everything that emits (`MediaInputManager`, `MediaSession`,
`Store`, `PermissionManager`).

`CrossTabLock` and `CrossTabChannel` are internal. They are injected into `MediaAccess`, `Store` and
`CameraProbeCache` and are what makes those classes safe across tabs.

### Entry point

```ts
const device = Device.create() // no browser access happens here

device.storage      // StorageManager
device.camera       // CameraManager
device.microphone   // MicrophoneManager
device.permission   // PermissionManager
device.location, device.platform, device.orientation
```

- `Device` has a private constructor. `Device.create(configuration?, environment?)` is the only way to get one; it is
  the composition root that builds every manager and injects the shared `DeviceEnvironment` and `Logger`.
- `DeviceEnvironment` is a class that wraps `window` and `navigator`. `DeviceEnvironment.browser()` resolves the real
  ones lazily; tests pass their own instance.
- There is no hidden global instance. `Device.create()` returns a new object every time; an app that wants a
  singleton keeps the instance itself (or binds it in its container).
- Managers are normally reached through the `Device` they belong to. Each also has its own static factory
  (`StorageManager.create()`, `CameraManager.create()`) for consumers that import a single area through a sub-path.
  Sessions, stores and controls are never constructed by the application; their manager or session creates them.

## Initialization and configuration

The application configures the devices once and every later call inherits that configuration. A recording
resolution that an application keeps in its settings is the driving case.

### Configuration

```ts
const device = Device.create({
  camera: {
    facing: 'back',
    require: { torch: true },
    resolution: { width: 1920, height: 1080 },   // e.g. read from the app's own settings
    frameRate: 30,
  },
  microphone: {
    require: { echoCancellation: true },
  },
  storage: {
    namespace: 'my-app',                          // prefix for every store, including the library's own cache
  },
})

device.camera.configure({ resolution: { width: 1280, height: 720 } })  // later, when the user changes the setting
device.camera.configuration                                            // the merged, current defaults
```

- `Device.create(configuration)` only stores the configuration. It is synchronous and touches no browser API.
- The argument is a `DeviceConfiguration` (interface, plain data). Each manager owns its section:
  `CameraManager.configuration` is a `CameraConfiguration`, `MicrophoneManager.configuration` a
  `MicrophoneConfiguration`.
- The camera and microphone sections have the same shape as the argument of `open()`. They are the defaults:
  `device.camera.open()` uses them as they are, `device.camera.open({ facing: 'front' })` overrides single fields.
- `configure()` is a method of the manager and replaces fields of its defaults at runtime. It affects sessions opened
  afterwards. A running session is changed explicitly with `session.configure({ resolution })`, which goes through the
  session's constraint queue.
- The library does not persist the configuration. The app owns its settings and passes them in; it can keep them in a
  `Store` if it wants to.

### Resolution

```ts
resolution: { width: 1920, height: 1080 }                  // ideal: closest the camera can do
resolution: { width: 1920, height: 1080, mode: 'exact' }   // fail with MediaRequirementsError otherwise
```

- Default mode is `ideal`, so a stored resolution that the selected camera cannot deliver degrades instead of failing.
  `session.settings` reports what was actually delivered, and the session emits `settingschange` when it changes.
- The configured resolution also takes part in camera selection: a camera whose `maxResolution` is below it is ranked
  lower (`ideal`) or removed (`exact`).
- The value is orientation-independent: the app configures 1920x1080 once and the library asks for the matching
  portrait or landscape variant. How each mobile browser treats width and height in portrait has to be checked on the
  device matrix before this is fixed.
- `descriptor.features.resolutions` (a filtered list of common resolutions up to `maxResolution`) lets the app build
  its settings screen from what the selected camera supports.

### Initialization

```ts
const result = await device.initialize({ camera: true, microphone: true })
// result.camera:     { permission: 'granted', selected: CameraDescriptor, cameras: CameraDescriptor[] }
// result.microphone: { permission: 'denied', error: PermissionDeniedError }
```

`Device.initialize()` is an instance method: the one explicit, awaited step that does the expensive and user-visible
work up front, so the app can run it on a set-up or permission screen instead of paying for it when the user presses
record. It delegates to `initialize()` on each requested manager, which:

1. requests the permissions the configuration needs (see [Getting access](#getting-access)),
2. enumerates and probes the cameras that the configured requirements can match, and fills the cache,
3. resolves the configured requirements to a concrete device and reports whether they can be satisfied, including the
   resolution.

It does not leave a stream running. It reports per device instead of throwing on the first failure, so an app can
continue without a microphone. It is optional: `open()` performs the same steps on demand when they have not happened
yet. Calling it again is cheap when permission is granted and the cache is valid.

## Multiple tabs

Users open an application in several tabs at once, whether it was built for that or not, and parallel access causes
problems. The library therefore treats "another tab of the same origin is using the same resource" as a
normal situation that it coordinates, not as an error the application has to discover.

### What goes wrong without coordination

- **Camera.** A phone has one camera pipeline. A second tab that opens the camera either fails, or succeeds and
  silently mutes or ends the track of the first tab. Probing makes this worse: it opens cameras one after another, so
  a tab that starts up and probes can interrupt a recording that is running in another tab.
- **Probe cache.** Two tabs loading at the same time both probe, at the same time, against the same hardware.
- **Stored data.** Read-modify-write on the same key from two tabs loses one update. An OPFS file with an open sync
  access handle cannot be opened by a second tab. An IndexedDB upgrade in one tab is blocked by an open connection in
  another.

The design covers all of them. The exact
behaviour per browser goes into the device matrix.

### Mechanism

Two internal classes in `core/`, both created once by `Device.create()` and injected where needed:

- **`CrossTabLock`** wraps the Web Locks API (`navigator.locks`). A lock is identified by name, is `exclusive` or
  `shared`, is visible to every tab of the origin, and is released by the browser when the holding tab closes or
  crashes. That last property is why this is used instead of a home-made lock in `localStorage`, which needs
  time-outs and can be left behind.
- **`CrossTabChannel`** wraps a `BroadcastChannel`. It carries notifications (store changed, probe cache updated,
  camera released) and the take-over request described below.

Because locks are identified by name and not by tab, two `Device` instances inside one tab are coordinated by the
same mechanism.

Where Web Locks are not available, `CrossTabLock` degrades to a lock that only works inside the tab.
`device.coordination.isCrossTab` reports `false` in that case and the library logs it once, so the limitation is
visible instead of silent.

### Camera and microphone

`MediaAccess` already is the only class that calls `getUserMedia`. It now takes the lock before every call:

| Operation                        | Lock                      | Held for                    |
| -------------------------------- | ------------------------- | --------------------------- |
| Access request (permission)      | `camera`, exclusive       | the request                 |
| Probing                          | `camera`, exclusive       | the whole probing run       |
| Open camera session              | `camera`, exclusive       | the lifetime of the session |
| Open microphone session          | `microphone`, see below   | the lifetime of the session |

- There is **one camera lock for the whole device**, not one per camera, because the limit being protected is the
  single camera pipeline. Whether desktop browsers should get a per-camera lock instead is a tuning question for
  later.
- The lock names are fixed for the origin, independent of the configured storage namespace, since the hardware is
  shared no matter which application uses it.
- **Probing never interrupts another tab.** If another tab holds the camera, `list({ detail: 'probed' })`, `select()`
  and `initialize()` use the cached probe results. Without a cache they follow the busy policy below.
- **Probing happens once.** A tab that waited for the lock re-reads the cache after acquiring it and skips probing if
  the other tab has just filled it.
- The microphone lock is `shared` by default, because several tabs can usually capture audio at once, and
  `exclusive` when configured. To be confirmed on the device matrix, in particular on iOS.

What happens when the camera is held by another tab is a policy, set in the configuration and overridable per call:

```ts
Device.create({ camera: { whenBusy: 'fail' } })          // default
await device.camera.open({ whenBusy: 'wait', signal })   // resolves once the other tab closes its session
await device.camera.open({ whenBusy: 'takeover' })
```

- `fail`: rejects immediately with `MediaDeviceBusyError`, whose `holder` is `'other-tab'`. The application can show
  "the camera is in use in another tab".
- `wait`: queues for the lock. Cancellable through an `AbortSignal`.
- `takeover`: asks the holding tab over the `CrossTabChannel` to release. The holder's session closes and emits
  `ended` with the reason `'taken-over'`, then the requester gets the lock. A session can refuse with
  `session.allowTakeover = false`, which an application sets while it is recording; the requester then gets
  `MediaDeviceBusyError`.

The state is observable without trying to open anything:

```ts
device.camera.availability                       // 'free' | 'held-by-this-tab' | 'held-by-other-tab'
device.camera.on('availabilitychange', ...)
```

Limits: the lock only coordinates tabs that use this library on the same origin. Another origin or a native app using
the camera is still reported by the browser, as `MediaDeviceBusyError` with `holder: 'unknown'` or as a `muted` /
`ended` event on the session.

### Storage

- **A single `set` or `delete` is atomic in every driver**: a reader in another tab sees the old value or the new
  one, never a partial write. `WebStorageDriver` and `IndexedDbStorageDriver` get that from the browser.
  `OpfsStorageDriver` writes through a writable that replaces the file on close, and serialises writers per key with
  a lock, which also avoids the "file is already open" failure of sync access handles.
- **Read-modify-write is an explicit operation.** `store.update(key, fn)` reads, applies `fn` and writes under an
  exclusive lock on `<namespace>/<key>`, so two tabs incrementing the same value both count. Plain `set` stays
  last-write-wins.
- **`store.lock(key, fn)`** runs `fn` while holding the key's lock, for sequences the application needs to protect
  itself.
- **Streams hold the key's lock** until they are closed, so a recording that is being written cannot be overwritten
  or deleted from another tab. A conflicting call waits, or fails with `StorageLockedError` when called with
  `{ wait: false }`.
- **`clear()`** takes the namespace lock exclusively; all other operations take it shared.
- **`IndexedDbStorageDriver`** closes its connection on `versionchange` and reopens lazily, so one tab never blocks
  an upgrade in another.
- **Change events** already cross tabs (see [Storage](#storage)), so a tab can keep derived state in sync instead of
  re-reading.
- **Version skew.** Tabs can run different versions of the application after a deployment. The value envelope carries
  a format version; a tab that reads a newer format than it knows fails with `StorageVersionError` instead of
  rewriting the entry in the old format.

`SessionStorageDriver` and `MemoryStorageDriver` are per tab by nature and need no coordination.

---

## Storage

### The problem being hidden

| Backend        | API shape     | Values                 | Lifetime          | Typical limit       | Change events            |
| -------------- | ------------- | ---------------------- | ----------------- | ------------------- | ------------------------ |
| `localStorage` | sync          | strings                | persistent        | about 5 MB          | `storage` (other tabs only) |
| `sessionStorage` | sync        | strings                | tab               | about 5 MB          | none across tabs         |
| OPFS           | async, files  | bytes, streams         | persistent        | quota-based, large  | none                     |
| IndexedDB      | async, transactional | structured clone | persistent        | quota-based, large  | none                     |
| memory         | sync          | anything               | page              | heap                | none                     |

Each has different failure modes too (quota errors, private mode, blocked third-party storage, missing API).

### Classes

Three roles, three classes:

- **`StorageManager`** (`device.storage`): opens stores, owns the driver registry, exposes quota and persistence.
- **`Store<T>`**: what the application works with. One concrete class for every backend. It owns the namespace, the
  codec, TTL handling and change notification, and delegates the raw reads and writes to its driver.
- **`StorageDriver`**: abstract base class, one subclass per backend. It only knows how to read, write, delete and
  list raw `string | Uint8Array` values.

Keeping `Store` concrete and putting the variation in `StorageDriver` means namespacing, codecs and TTL are written
once, and a new backend is a small subclass.

```ts
class Store<T = unknown> extends EventEmitter<StoreEvents<T>> {
  get(key: string): Promise<T | undefined>
  set(key: string, value: T, options?: { ttl?: number }): Promise<void>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<boolean>
  update(key: string, fn: (current: T | undefined) => T): Promise<T>   // atomic across tabs
  lock<R>(key: string, fn: () => Promise<R>): Promise<R>
  size(): Promise<number>                      // bytes used by this store's namespace
  clear(): Promise<void>                       // only this store's namespace
  keys(): AsyncIterable<string>
  entries(): AsyncIterable<[string, T]>

  readStream(key: string): Promise<ReadableStream<Uint8Array> | undefined>   // StorageUnsupportedError unless
  writeStream(key: string): Promise<WritableStream<Uint8Array>>              // capabilities.streaming

  readonly capabilities: StorageCapabilities
}

abstract class StorageDriver {
  abstract readonly name: string
  abstract readonly capabilities: StorageCapabilities
  abstract isSupported(): Promise<boolean>

  abstract read(namespace: string, key: string): Promise<string | Uint8Array | undefined>
  abstract write(namespace: string, key: string, value: string | Uint8Array): Promise<void>
  abstract remove(namespace: string, key: string): Promise<boolean>
  abstract list(namespace: string): AsyncIterable<string>
  abstract clear(namespace: string): Promise<void>
  abstract measure(namespace: string): Promise<number>   // bytes

  // overridden by drivers that can stream; the base implementation throws StorageUnsupportedError
  openReadStream(namespace: string, key: string): Promise<ReadableStream<Uint8Array> | undefined>
  openWriteStream(namespace: string, key: string): Promise<WritableStream<Uint8Array>>
}

class StorageCapabilities {
  readonly driver: string                         // 'local' | 'session' | 'opfs' | 'indexeddb' | 'memory' | custom
  readonly persistence: 'page' | 'tab' | 'origin'
  readonly binary: boolean                        // stores bytes without base64
  readonly streaming: boolean
  readonly crossTabEvents: boolean
}

interface Codec<T> {
  encode(value: T): string | Uint8Array
  decode(raw: string | Uint8Array): T
}
```

### Creating a store

```ts
const settings = device.storage.open<Settings>({
  driver: 'local',
  namespace: 'settings',
  codec: new JsonCodec<Settings>(),   // default
})

const recordings = device.storage.open({
  driver: ['opfs', 'indexeddb'],      // first supported driver wins
  namespace: 'recordings',
  codec: new BinaryCodec(),
})

await device.storage.isSupported('opfs')
```

- **Namespace** prefixes keys (local/session), names the directory (OPFS) or is part of the key (IndexedDB).
  `clear()` never touches data outside its namespace.
- **Codec** turns `T` into what the driver can hold. Built-in classes: `JsonCodec<T>`, `TextCodec`, `BinaryCodec`.
  `JsonCodec` takes an optional validator in its constructor (`new JsonCodec({ parse: schema.parse })`) so a consumer
  can plug in zod without the library depending on it. An application adds its own by implementing `Codec<T>`.
- **Fallback chain**: `driver` accepts a list. The chosen driver is visible through `store.capabilities.driver`, so
  the app can react if it landed on a weaker one.
- **TTL** is stored in an envelope next to the value and enforced lazily on read.
- **Change events**: `store.on('change', ...)`. Cross-tab changes come from the `storage` event for local and from a
  `BroadcastChannel` for OPFS and IndexedDB, so the event behaves the same for every persistent driver.
- **Custom drivers**: `device.storage.register(new MyDriver())`, where `MyDriver extends StorageDriver`. This is the
  "possible others" hook: Cache API, cookies, a remote store.

### Storage space

An application that records video has to know whether there is room before it starts and while it runs.

```ts
const space = await device.storage.space()   // StorageSpace

space.isKnown        // false where the browser gives no estimate
space.quota          // bytes the origin may use
space.usage          // bytes the origin uses
space.available      // quota - usage
space.usedRatio      // 0..1
space.isPersistent   // true once the browser promised not to evict the data
space.hasRoomFor(bytes)

await recordings.size()                      // bytes used by one store's namespace

await device.storage.persist()               // ask the browser to make the data persistent, returns the new state
```

```ts
class StorageSpace {
  readonly isKnown: boolean
  readonly quota: number | undefined
  readonly usage: number | undefined
  readonly available: number | undefined
  readonly usedRatio: number | undefined
  readonly isPersistent: boolean

  hasRoomFor(bytes: number): boolean         // false when unknown, so callers fail safe
}
```

Watching, for the duration of a recording or for a settings screen:

```ts
using watch = device.storage.watchSpace({ interval: 5_000, lowBelow: 200 * 1024 * 1024 })
watch.on('change', (space) => ...)
watch.on('low', (space) => ...)      // crossed below `lowBelow`
```

- `StorageManager.space()` wraps `navigator.storage.estimate()` and `navigator.storage.persisted()` and returns an
  immutable `StorageSpace` value object. Where the API is missing it returns one with `isKnown: false` instead of
  throwing.
- `StorageSpaceWatch` polls, because the browser has no event for it. It is a disposable object returned by
  `watchSpace()` and stops polling when disposed. It also re-reads after a write in another tab is announced on the
  `CrossTabChannel`.
- `Store.size()` delegates to `StorageDriver.measure()`: the OPFS driver sums file sizes, the IndexedDB driver sums
  the encoded sizes it records with each entry, the web storage drivers count the characters of their keys and
  values.
- A failed write carries the numbers: `StorageQuotaExceededError` has a `space` property with the `StorageSpace` at
  the time of the failure.

What the numbers mean, stated in the API documentation so applications do not over-trust them:

- They are **for the whole origin**, shared by every tab and including data the library did not write (caches,
  service worker, the application's own IndexedDB).
- They are **estimates**. Browsers round or pad them, and the quota can change with the free space of the disk.
- **`localStorage` and `sessionStorage` have their own fixed limit** of a few megabytes that is not part of this
  quota and that the browser does not report. For those drivers `size()` works, but the only reliable signal for
  "full" is `StorageQuotaExceededError` on write.
- Without persistence the browser may evict the data under storage pressure. `isPersistent` and `persist()` make that
  visible and controllable.

### Driver notes

- **`LocalStorageDriver` / `SessionStorageDriver`**: share a `WebStorageDriver` base class that wraps a `Storage`
  object. `isSupported()` catches `QuotaExceededError` and `SecurityError` on first touch, so the driver reports as
  not supported instead of throwing later.
- **`OpfsStorageDriver`**: one file per key under `<namespace>/`, key encoded to a safe file name. Writes through
  `createWritable()`; where that is missing, falls back to a sync access handle in a worker. Whether the worker
  fallback is worth shipping depends on the supported browser baseline (open decision).
- **`IndexedDbStorageDriver`**: one database for the library. Opening a new object store needs a version bump, so all
  namespaces share one object store with the compound key `[namespace, key]`.
- **`MemoryStorageDriver`**: a `Map`. Used in tests, SSR and as the last entry of a fallback chain.

### Errors

`StorageUnsupportedError`, `StorageQuotaExceededError`, `StorageCodecError`, `StorageAccessDeniedError`,
`StorageLockedError`, `StorageVersionError`, all extending
`StorageError`, which extends `DeviceError`.

---

## Camera and microphone

### The problem being hidden

1. `enumerateDevices()` is useless, and can cause follow-up failures, until camera permission has been requested
   explicitly. Observed on real phones, on iOS and on Android: the cameras are only reported after the permission
   request. Some Android phones add a second condition: a stream for a back camera fails to start unless the
   permission request itself was made for the back-facing camera. Since features are read from a live stream,
   probing the back cameras depends on that.
2. A device list tells you almost nothing. `InputDeviceInfo.getCapabilities()` (not available everywhere) reports
   resolution, frame rate and facing mode, but **not** torch, zoom or focus. Those only appear on a _live track_ of
   that specific camera.
3. `facingMode: 'environment'` lets the browser pick among all back cameras. On a multi-camera phone it may pick the
   ultra-wide or telephoto module, which has no torch.
4. Mobile devices generally cannot open two cameras at once, so cameras have to be inspected one after another.
5. On Chrome for Android the torch capability can be missing from `getCapabilities()` for a short time after the track
   starts.
6. Labels are not a stable contract: Android reports things like `camera2 0, facing back`, iOS reports localized names.
7. `deviceId` is stable per origin only until the user clears site data or resets permissions.
8. Errors arrive as `DOMException` with names such as `NotAllowedError`, `NotReadableError`, `OverconstrainedError`
   whose meaning differs slightly per browser.

A phone with several cameras per side is exactly points 2 to 4: two front and two back cameras are listed, only one
back camera has a torch, and the only way to find out which is to open each back camera and ask.

Points 5 to 7 and the exact per-browser behaviour need to be confirmed on real devices in phase 3. The plan does not
depend on the specifics, only on "features are only reliable from a live track".

### Shared model

Camera and microphone are the same thing at three levels. Each level is an abstract base class in `media/` with one
subclass per input kind:

| Role                                                                          | Base class                         | Camera             | Microphone             |
| ----------------------------------------------------------------------------- | ---------------------------------- | ------------------ | ---------------------- |
| List devices, watch for changes, select by requirements, open a session       | `MediaInputManager<TDescriptor, TSession>` | `CameraManager`    | `MicrophoneManager`    |
| Immutable description of one physical input and its features                  | `MediaInputDescriptor`             | `CameraDescriptor` | `MicrophoneDescriptor` |
| One running stream of one device, with typed controls and lifecycle events    | `MediaSession`                     | `CameraSession`    | `MicrophoneSession`    |

The base classes hold everything that does not depend on the kind: the access gate, enumeration, the `change` event,
configuration merging, stream lifecycle, the constraint queue and error mapping. Subclasses add what is specific:
probing and facing for cameras, processing and level metering for microphones.

Supporting classes, each with a single job and injected into the manager:

- `MediaAccess`: the access gate (next section).
- `CameraProber`: opens cameras one by one and builds `probed` descriptors.
- `CameraProbeCache`: persists probe results in a `Store`.
- `CameraSelector`: filters and ranks descriptors against requirements.

### Descriptors

```ts
abstract class MediaInputDescriptor {
  readonly id: string                       // deviceId
  readonly groupId: string
  readonly label: string
  /** how much of `features` can be trusted */
  readonly detail: 'listed' | 'static' | 'probed'
}

class CameraDescriptor extends MediaInputDescriptor {
  readonly facing: 'front' | 'back' | 'external' | 'unknown'
  readonly features: CameraFeatures

  satisfies(requirements: CameraRequirements): boolean
}

class CameraFeatures {
  readonly torch: boolean
  readonly zoom: ZoomRange | undefined      // { min, max, step }
  readonly focusModes: readonly string[]    // 'continuous', 'manual', ...
  readonly focusDistance: Range | undefined
  readonly maxResolution: Resolution | undefined
  readonly resolutions: readonly Resolution[]   // common resolutions up to maxResolution
  readonly maxFrameRate: number | undefined

  static fromCapabilities(capabilities: MediaTrackCapabilities): CameraFeatures
}

class MicrophoneDescriptor extends MediaInputDescriptor {
  readonly isDefault: boolean
  readonly features: MicrophoneFeatures     // echoCancellation, noiseSuppression, autoGainControl,
                                            // maxChannelCount, sampleRates
  satisfies(requirements: MicrophoneRequirements): boolean
}
```

Descriptors and feature objects are immutable value objects. `CameraFeatures.fromCapabilities()` is the single place
that interprets the browser's capability object, so the core needs no schema library.

`detail` makes the quality of the information explicit:

- `listed`: only what `enumerateDevices()` gave (id, label).
- `static`: plus `InputDeviceInfo.getCapabilities()` where the browser has it.
- `probed`: read from a live track. The only level at which `torch`, `zoom` and `focus*` are meaningful.

### Getting access

Rule for the whole media module: **`enumerateDevices()` is never called before access has been requested through
`getUserMedia`, and a camera is never opened by `deviceId` before access was requested for its facing.** The
`MediaAccess` class is the only class that holds a reference to `navigator.mediaDevices`. Enumeration, probing and
`open()` all go through it, so no other class can call `enumerateDevices()` or `getUserMedia` directly.

```ts
device.camera.access                              // CameraAccessState { front: 'locked', back: 'granted', ... }
await device.camera.requestAccess({ facing: 'back' })
```

- Access is tracked **per facing**, not as one flag. Requesting access for `back` means a `getUserMedia` call with
  `facingMode: 'environment'`; for `front`, `'user'`. A grant obtained through the front camera does not count as
  access to the back cameras.
- The request uses `facingMode: { exact }` and falls back to `ideal` only when the device has no camera with that
  facing (desktop webcams report none). Whether `ideal` alone is enough on the affected phones is a question for the
  device matrix; `exact` is the safe default.
- The stream from the access request is not thrown away. Its track is the probe for the camera the browser picked,
  and it is stopped before the next camera is opened.
- Access state lives for the page. A persisted "granted" from the Permissions API is not treated as access: the
  explicit request is still made once per page load, because the observed failures are about the request having
  happened, not about the stored permission. With a persisted grant this request shows no prompt.
- The Permissions API is only used to tell `prompt` from `denied` before asking, so the app can explain the prompt or
  show how to unblock.

Consequences for the public API:

- `list()` never prompts and never enumerates behind the gate. Without access it returns an empty list and
  `device.camera.access` says why, instead of returning descriptors with empty ids and labels.
- `list({ detail: 'probed' })`, `select()`, `open()` and `initialize()` request the access they need. For a
  requirement without `facing` that means both facings, back first.
- Microphones go through the same gate with an audio request; they have no facing.
- Every call the gate makes is also guarded by the cross-tab lock, so an access request or a probe in one tab cannot
  disturb a session in another (see [Multiple tabs](#multiple-tabs)).

### Discovery and probing

```ts
const cameras = await device.camera.list()                    // no prompt; empty until access was requested
const cameras = await device.camera.list({ detail: 'probed' }) // requests access, opens cameras, see below
device.camera.on('change', (cameras) => { ... })              // wraps 'devicechange'
```

Probing pipeline (`CameraProber.probe(requirements)`):

1. **Request access** for every facing the requirements can match, as described above. Nothing below runs for a
   facing whose request failed; its cameras are reported as not accessible.
2. **Enumerate** video inputs, read static capabilities where available, derive `facing` from capabilities first and
   from a label heuristic second. Cameras whose facing has no access are left at `detail: 'listed'` and are not
   probed.
3. **Narrow**: drop candidates that static information already rules out (wrong facing, resolution too low). On a
   phone with two front and two back cameras, a request for a back camera never opens the two front cameras.
4. **Probe sequentially**: for each remaining candidate, `getUserMedia({ video: { deviceId: { exact } } })`, wait for
   capabilities to settle (re-read until stable or a short timeout, to cover point 5), build the `CameraFeatures`,
   stop the track. Never two at once.
5. **Cache** the result through `CameraProbeCache`, which uses a library-owned `Store` (`local` with memory fallback)
   keyed by the set of enumerated `deviceId`s. If the set differs on the next visit (ids rotated, camera plugged in),
   the cache is discarded and probing runs again. A selection that fails with `OverconstrainedError` or
   `NotFoundError` also invalidates it.

Probing costs roughly one camera start per candidate. The cache makes that a first-visit cost. `list()` without
`detail: 'probed'` never opens a camera.

The probe cache is the first internal consumer of the storage module, which is why storage is built first.

### Selection by features

```ts
const camera = await device.camera.select({
  facing: 'back',
  require: { torch: true },
  prefer: { zoom: true, minResolution: { width: 1920, height: 1080 } },
})
// -> CameraDescriptor | undefined
```

`CameraManager.select()` runs the prober and hands the descriptors to `CameraSelector`:

- `require` filters (`descriptor.satisfies()`). A camera that does not satisfy it is never returned. No match gives
  `undefined` from `select` and a `MediaRequirementsError` (listing which requirement removed which camera) from
  `open`.
- `prefer` scores the remaining candidates.
- Ties are broken by a fixed order: largest zoom range, then highest resolution, then enumeration order. The intent
  is to land on the main camera rather than an auxiliary lens; the order is a heuristic to tune against the device
  matrix.
- `strategy: 'best'` (default) probes every candidate after narrowing. `strategy: 'first'` stops at the first camera
  that satisfies `require`, for apps that care about start-up time more than ranking.
- An escape hatch stays available: `device.camera.open({ id })` and `open({ constraints })` for raw
  `MediaTrackConstraints`.

`MicrophoneManager.select()` has the same shape (`require: { echoCancellation: true }`, `prefer: { default: true }`),
without the probing cost in most cases because microphones can be opened in parallel and expose their capabilities on
the first track.

### Sessions

```ts
abstract class MediaSession extends EventEmitter<MediaSessionEvents> implements AsyncDisposable {
  readonly stream: MediaStream        // for <video>.srcObject, MediaRecorder, WebRTC
  readonly state: 'live' | 'muted' | 'ended'
  close(): Promise<void>
}

class CameraSession extends MediaSession {
  readonly descriptor: CameraDescriptor
  readonly track: MediaStreamTrack
  readonly settings: CameraSettings   // actual width, height, frameRate

  readonly torch: TorchControl | undefined
  readonly zoom: ZoomControl | undefined
  readonly focus: FocusControl | undefined

  configure(changes: CameraSessionChanges): Promise<void>
  switchTo(requirements: CameraRequirements): Promise<void>
}
```

```ts
await using session = await device.camera.open({
  facing: 'back',
  require: { torch: true },
  resolution: { width: 1920, height: 1080 },   // ideal
})

await session.torch?.set(true)
session.torch?.enabled
await session.zoom?.set(2)
session.zoom?.range     // ZoomRange
session.zoom?.level     // read from the track, not assumed
await session.focus?.setMode('continuous')

await session.switchTo({ facing: 'front' })    // same session object, new track
session.on('statechange' | 'settingschange' | 'ended' | 'devicechange', ...)
```

Design points:

- Sessions are created by their manager, never by the application. `open(requirements)` merges the requirements over
  the configured defaults (see [Initialization and configuration](#initialization-and-configuration)), then is
  `select` + `getUserMedia({ deviceId: { exact } })`. If the cached descriptor turns out to be stale, it re-probes
  once and retries before failing.
- A cached probe result does not replace the access request. On a later visit `open()` still requests access for the
  facing first and only then opens the cached `deviceId`.
- `session.configure({ resolution, frameRate })` changes a running session through the constraint queue and reads the
  result back into `session.settings`.
- **Controls are objects.** `TorchControl`, `ZoomControl`, `FocusControl` extend the abstract `TrackControl`, which
  holds the track and the queue. The session creates a control only when the open camera has the feature, so there
  are no `isSupported` flags to forget.
- Control state is read back from `track.getSettings()` after every change, so it cannot drift from the hardware.
- **All constraint changes on a session go through one `ConstraintQueue`**, owned by the session and shared by its
  controls. This generalises the current iOS-only queue and makes overlapping torch/zoom calls safe everywhere.
- **Platform differences are quirk objects, not session subclasses.** `PlatformQuirk` is an abstract class with hooks
  around a constraint change (`beforeApply`, `afterApply`) and around reading capabilities. The session is composed
  with the list returned by `PlatformQuirks.for(platform)`. The current iOS torch workaround becomes
  `IosTorchResetsOnZoomQuirk`; late-arriving capabilities on Android become another. A new workaround is a new class,
  and `CameraSession` stays one class for every platform.
- Several sessions can exist at once (camera + microphone, or two microphones). There is one camera session per
  origin at a time, across all tabs; a second `open()` follows the `whenBusy` policy from
  [Multiple tabs](#multiple-tabs).
- Lifecycle is observable instead of logged: track `ended`, `mute`, `unmute` and device removal surface as events.
  `autoRecover: true` re-opens with the same requirements after an unexpected `ended` (for example the page returning
  from the background on iOS).
- Combined capture: `device.media.open({ camera: {...}, microphone: {...} })` returns a `CombinedMediaSession` that
  owns a `CameraSession` and a `MicrophoneSession` and exposes one `MediaStream`, for recording with synchronised
  audio.

`MicrophoneSession` follows the same contract with its own controls:

```ts
await using mic = await device.microphone.open({ require: { echoCancellation: true } })
await mic.processing.set({ noiseSuppression: false })   // ProcessingControl extends TrackControl
mic.level.on('change', (rms) => ...)                    // LevelMeter, AnalyserNode-based, started on first listener
mic.muted = true                                        // track.enabled
```

### Permissions

```ts
await device.permission.query('camera')    // 'granted' | 'denied' | 'prompt' | 'unknown'
await device.permission.request('camera')  // prompts, returns the new state
device.permission.on('change', ...)
```

- `PermissionManager` wraps the Permissions API; it returns `'unknown'` where a browser cannot query that name
  instead of throwing.
- `request` for camera and microphone delegates to the access gate (`device.camera.requestAccess`), since opening a
  stream is the only way to prompt. `request('camera')` takes an optional `facing` and defaults to the configured one.
- Covers `camera`, `microphone`, `geolocation` and `persistent-storage`, so the app has one place to drive a
  permission screen.
- Insecure context and missing `mediaDevices` are reported as `'unsupported'` up front.

### Errors

| Browser signal                                    | Library error                |
| ------------------------------------------------- | ---------------------------- |
| `NotAllowedError`, `SecurityError`                | `PermissionDeniedError`      |
| `NotFoundError`                                   | `MediaDeviceNotFoundError`   |
| `NotReadableError`, `AbortError`                  | `MediaDeviceBusyError` (`holder: 'unknown'`) |
| camera lock held by another tab                   | `MediaDeviceBusyError` (`holder: 'other-tab'`) |
| `OverconstrainedError`, no camera matches `require` | `MediaRequirementsError`   |
| no `mediaDevices`, insecure context               | `UnsupportedError`           |
| use after close                                   | `SessionClosedError`         |

The media errors extend `MediaError`, which extends `DeviceError`. Every error sets `name` and keeps the original as
`cause`. The mapping from `DOMException` lives in one static factory, `MediaError.from(error)`.

---

## Location, platform, orientation

Small classes, aligned with the rest:

- **`DeviceLocation`**: `device.location.current(options)` (one shot) and `device.location.watch(options)` returning a
  disposable `LocationWatch` that emits positions. No implicit watch on property read. Errors mapped to the common
  hierarchy.
- **`DevicePlatform`**: detects iOS and Android, prefers `navigator.userAgentData` where present. Its main job
  is selecting the platform quirks.
- **`DeviceOrientation`**: extends `EventEmitter` and has a `change` event next to the two getters.

## Phases

Each phase ends in something that builds, is tested, and could be released.

**0. Package foundation**
`package.json`, tsconfig, build (ESM + types, sub-path exports), Vitest, lint. Add
`core/`: `Device` with `Device.create()`, `DeviceEnvironment`, the `Logger` interface with a `NullLogger` default,
`EventEmitter`, `DeviceError`, `CrossTabLock` (with the in-tab fallback) and `CrossTabChannel`.

**1. Storage**
`StorageManager`, `Store`, `StorageDriver`, the codec classes, namespacing, `MemoryStorageDriver`,
`LocalStorageDriver`, `SessionStorageDriver`, fallback chain, change events, errors. Then `OpfsStorageDriver` and
`IndexedDbStorageDriver`, `StorageSpace`, `StorageSpaceWatch`, `Store.size()`, `persist`, cross-tab events and
locking (`update`, `lock`, stream locks, `versionchange` handling), custom driver registration.
_Done when:_ one contract test suite passes against every `StorageDriver` subclass, and a two-tab test shows that
concurrent `update()` calls on one key lose no update for every persistent driver.

**2. Permissions and media core**
`PermissionManager`. `MediaAccess` with per-facing state. Configuration (`Device.create(configuration)`,
`configure`, merge with per-call requirements). The abstract `MediaInputManager`, `MediaInputDescriptor`,
`MediaSession`, `TrackControl` and `PlatformQuirk`, `ConstraintQueue`, error mapping. Fake `MediaDevices` /
`MediaStreamTrack` test doubles that model per-device capabilities, including "one camera at a time", late-arriving
capabilities, empty enumeration before access, and back cameras that refuse to start until access was requested with
the back facing.
Cross-tab locking in `MediaAccess`, the `whenBusy` policies, take-over, `availability`.
_Done when:_ a test proves that no code path reaches `enumerateDevices()` or a `deviceId` request before the access
request for that facing, and that no `getUserMedia` call happens without holding the lock.

**3. Camera**
`CameraManager`, `CameraDescriptor`, `CameraFeatures`, `CameraProber`, `CameraProbeCache`, `CameraSelector`,
`CameraSession` with resolution handling and `configure`, `TorchControl` / `ZoomControl` / `FocusControl`, the first
quirk classes, `switchTo`, `autoRecover`, `Device.initialize()`. A demo page that lists every camera with its probed
features and lets a tester toggle them; this is also the tool for collecting the device matrix.
_Done when:_ on the reference phones (one with iOS, an Android phone with one back camera and an Android phone with
several cameras per side), from
a fresh page load, `initialize()` followed by `open()` with `{ facing: 'back', require: { torch: true } }` and a
configured resolution returns the torch-capable back camera at that resolution, on first and on cached visits. With
a session running in one tab, loading the application in a second tab does not interrupt it, and each `whenBusy`
policy behaves as specified.

**4. Microphone**
`MicrophoneManager`, `MicrophoneDescriptor`, `MicrophoneSession`, `ProcessingControl`, `LevelMeter`,
`CombinedMediaSession`.

**5. Location, platform, orientation**
Align APIs and errors.

**6. Adapters and documentation**
Vue composables, inversify module, fabric renderer. README and API docs, first tagged release.

Phases 1 and 2 are independent and can run in parallel. 3 depends on both. 4 depends on 2. 5 depends on 0 only.

## Testing

- **Unit**: every class against injected fakes (`DeviceEnvironment` with fake `navigator`); no real browser APIs.
  Storage drivers share one contract suite. Abstract base classes are tested through a minimal test subclass.
- **Browser**: Vitest browser mode or Playwright for the storage drivers (real OPFS / IndexedDB) and for media with
  the browsers' fake-device flags. Fake devices do not expose torch, so they cover the pipeline, not the features.
- **Multiple tabs**: unit tests against a fake lock manager shared by two `Device` instances. Playwright tests with
  two pages in one browser context for storage (concurrent `update`, stream locks, IndexedDB upgrade) and for the
  camera lock with fake devices. The real effect of a second tab on a running camera is only visible on phones and is
  part of the manual matrix.
- **Real devices**: the demo page from phase 3, run manually against a written matrix: at least one multi-camera
  Android phone on Chrome, a current phone with iOS on Safari, desktop Chrome, Firefox and Safari. Results are recorded in
  the repo and drive the quirk classes.

## Risks

- **Probing is slow and visible.** Each probe starts a camera (indicator light, start-up delay). Mitigated by
  narrowing, caching and `strategy: 'first'`; the first visit on a phone with many cameras still pays for it.
- **The access rules come from two observed devices, not from a specification.** Other phones may need less or
  something different. `MediaAccess` is deliberately the strictest variant (explicit request, per facing, once per
  page load) and is the single place to adjust when the device matrix shows more.
- **Requesting access for both facings means two camera starts** when the requirements name no facing. Configuring a
  facing avoids it.
- **Feature detection differs per browser and changes between versions.** The descriptor's `detail` level and the
  quirk classes keep that contained, but only device testing shows what is true. Budget time for it in phase 3.
- **Firefox exposes little of the image-capture constraint set.** There, cameras end up with `torch: false` and no
  zoom; `require: { torch: true }` fails with a clear error instead of picking a wrong camera.
- **`deviceId` rotation** invalidates the cache. Handled by keying on the id set and by the retry in `open`.
- **OPFS write support** differs between main thread and worker depending on browser version; settled by the baseline
  decision below.
- **Coordination only reaches tabs that run this library.** A tab still running an older build of the application
  without it, another origin, or a native app is outside the lock. Those cases fall back to the browser's own
  behaviour and are reported as `MediaDeviceBusyError` or as session events.
- **A background tab keeps its lock.** A tab that holds the camera and is put in the background keeps other tabs
  out until its session closes. `whenBusy: 'takeover'` is the way out; whether a frozen background tab still answers
  the take-over request has to be tested, and the fallback is that the session closes itself when its page is hidden
  for longer than a configurable time.
- **Storage space numbers are estimates** for the whole origin. `hasRoomFor()` can be wrong in both directions, so
  writes still have to handle `StorageQuotaExceededError`.
- **Tree shaking.** `Device` references every manager, so importing it pulls in the whole library. Consumers that
  only want one area use the sub-path export and construct that manager directly (`StorageManager.create()`); each
  manager gets its own static factory for this.

## Implementation notes

Decisions that were made while implementing, and where the code differs from the sections above.

### Decided

- **Tooling**: pnpm, TypeScript 7, Vite (library build) with `tsc` for the declarations, Vitest, oxlint, oxfmt.
- **`using`**: the compiler turns `using` into try / finally, but the result still needs `Symbol.dispose` at runtime.
  The library defines the two symbols where they are missing. This is its only side effect on import.
- **Disposable owners**: the library never hands out a browser resource that needs cleanup without an object that
  owns and disposes it. Every such object also has a plain method (`dispose()`, `close()`, `release()`).
- **Open decisions 2, 3 and 5** are taken as recommended: fabric and inversify become adapters, no zod in the core.

### Phase 0

- `EventEmitter.on()` returns an `EventSubscription` (disposable). A failing listener does not keep the others from
  their event; the failure is rethrown afterwards.
- `CrossTabLock.acquire()` returns a handle. `handle.release()` returns a promise that resolves once the lock is free
  for others, because a lock manager releases asynchronously.

### Phase 1 (storage)

- **`device.storage.open()` is asynchronous.** Whether a driver is supported can only be found out asynchronously, and
  `store.capabilities` is synchronous. Opening therefore resolves the fallback chain and fails with
  `StorageUnsupportedError` right there instead of on first use.
- **`store.lock(key, task)` passes the locked entry to the task** (`entry.get()`, `entry.set()`, `entry.delete()`).
  Web Locks are not reentrant, so calling `store.set(key)` inside the task would wait for the task itself.
- **There is no namespace lock.** A lock that every write shares and `clear()` takes exclusively deadlocks as soon as
  a task that holds an entry writes a second one while a `clear()` is waiting. `clear()` deletes entry by entry under
  each entry's lock instead. Reads take no lock; a single write is atomic in every driver.
- **Change events use the `CrossTabChannel` for every shared driver**, also for `localStorage`, instead of the
  `storage` event. One mechanism, and the event also reaches a second store on the same data inside the tab.
  A change carries `origin: 'local' | 'remote'`.
- **`StorageDriver`** has no `clear()` (see above) and gained `peek()`, which reads the head of an entry. The store
  uses it to check the expiry of a large entry without loading it.
- **Entry format**: one header line of JSON (`v` format version, `t` string or bytes, `e` expiry), a line feed, the
  encoded value. Bytes are base64 on the drivers that only hold strings.
- **OPFS**: no worker fallback. A browser without `createWritable()` on the main thread reports the driver as not
  supported and the fallback chain moves on (to IndexedDB). Every file starts with a marker byte, so an empty file
  (created, not yet written) counts as missing. File names escape uppercase letters, because some file systems do
  not tell names apart by case.
- **Locks for data that is not shared between tabs** (`session`, `memory`) only reach inside the tab.
- **Verified in real browsers** (Vitest browser mode with Playwright, including a real second tab): Chromium and
  Firefox pass everything. The WebKit build of Playwright has no working OPFS, so there OPFS is skipped. **OPFS in a
  real Safari, on macOS and iOS, is not verified** and belongs on the device matrix.

### Phase 2 (permissions and media core)

- **Leases.** `MediaAccess.acquire()` returns a `MediaLease`: the cross-tab lock together with the right to start
  devices. `getUserMedia` can only be reached through a lease, which is what makes "no device without the lock" a
  property of the structure instead of a convention. A lease runs one stream at a time and stops it before it starts
  the next. A session owns its lease; probing (phase 3) holds one lease for the whole run.
- **One gate per kind.** `Device.create()` builds a `MediaAccess` for the camera (lock mode `exclusive`) and one for
  the microphone (`shared`). The managers of phases 3 and 4 receive them.
- **Access state** has three scopes: `front`, `back` and `any`. `any` is the scope of a microphone, of a request
  without a facing and of a camera whose facing is not known; such a camera is covered by access of any scope. The
  states are `locked`, `granted`, `denied` and `unavailable` (no device to request access through). The state lives
  in the `Device` object, so a second `Device` in the same tab requests access again (without a prompt).
- **`requestAccess()` does not reject for a refusal**; the returned state tells. It rejects for a busy device and
  where media devices do not exist. `open()` does reject with `PermissionDeniedError`.
- **A refused or missing scope is requested again on the next call**, because the user may have changed the
  permission in the settings of the browser in the meantime. A refused request fails without a prompt.
- **`MediaInputManager`** resolves a call in this order: access for the scopes the requirements need, list, pick,
  open by `deviceId`. Subclasses provide `describe`, `accessScopes`, `scopeOf`, `pick` and `createSession`. The
  descriptor has no `satisfies()` in the base class; picking belongs to the manager.
- **Merging** is shallow: a field of a call replaces the configured field as a whole (`require` included), a field
  that is not set replaces nothing. `signal` belongs to a single call and is never kept in the configuration.
- **`MediaDeviceBusyError.holder`** has a third value, `this-tab`, for a second session in the same `Device`.
  `availability` means the same: `held-by-this-tab` is this `Device` object.
- **Take-over**: the requester asks the holders over the channel and waits for the lock. A holder that refuses
  answers, and the requester fails at once. A holder without a session (an access request, a probing run) does not
  answer; the requester gets the lock when that work is done, or fails after 5 seconds.
- **`availability`** is kept current while someone listens to `availabilitychange`. A tab that is closed while it
  holds the device cannot announce that, so the lock is asked again every 2 seconds while another tab holds it.
  Without a listener the property is the last known value, and reading it starts a check in the background;
  `refreshAvailability()` gives the current value.
- **`ended` is emitted after the lock was released**, so a listener can open the device again. The track is stopped
  and `state` is `ended` before that, synchronously with `close()`.
- **`MediaErrorFactory.from()`** instead of `MediaError.from()`: a base class that creates its subclasses would be an
  import cycle. Same shape as `StorageErrorFactory`.
- **`PermissionDeniedError` is not a `MediaError`.** It extends `DeviceError` directly and lives in `permission/`,
  because geolocation refuses permissions as well.
- **`PermissionManager`** is given one `PermissionRequester` per permission. Where the Permissions API cannot tell
  (`camera` in Firefox, a permission granted for one visit), the requester is asked what it knows, so `query()` after
  a successful request reports `granted`. The `change` event carries `{ name, state }`.
- **`DeviceConfiguration` has no `camera` and `microphone` section yet.** The merging lives in `MediaInputManager`;
  the sections are added with the managers that read them (phases 3 and 4).
- **Not in this phase**: `PlatformQuirks.for(platform)` and the concrete quirks (phase 3). The iOS torch workaround
  exists as a quirk in the spec of the queue and proves that the hooks are enough for it.
- **Verified in real browsers** (Chromium and Firefox with the camera the browser fakes, including a real second
  tab): the access gate, the fallback for cameras without a facing, the lock, all three busy policies, take-over in
  both directions, `availability` including a tab that is closed while it holds the camera. The WebKit build of
  Playwright has no camera; **Safari is not verified**. The fake camera has no facing, no torch and no zoom.
- **Found in real browsers, for the device matrix:**
  - Firefox does not start a camera in a tab that is in the background; `getUserMedia` waits until the tab is looked
    at. A background tab that calls `open()` therefore holds the lock without a running camera until then, and a
    take-over request does not reach it, because it has no session yet. Not solved in this phase.
  - Chromium reports `{ ideal: 10 }` back as `10` from `getConstraints()`. The queue merges whatever is reported.
  - Firefox accepts some `exact` constraints on a running track that Chromium rejects (`facingMode`, `width` on the
    fake camera).
  - The browser specs run one file after another (`fileParallelism: false`), because of the first point.

### After phase 2: `localStorage` and several tabs

- **`localStorage` does not reach another tab at once in Firefox and WebKit.** A tab that takes the lock right after
  another tab wrote can still read the old value, so `update()` on the `local` driver could lose an update. This is a
  property of the browsers, not of the store. Measured without the library, with two real tabs that each read, add
  one and write under the same Web Lock (3 runs of 3000 updates): Chromium lost none, Firefox 36 to 65, WebKit 9 to
  30. With `store.update()` it was rare, because the store awaits a few times before it reads: 1 of 1800 in Firefox,
  and 2 of 14 runs of the two-tab specs failed in WebKit. `indexeddb` lost none in any browser.
- **Decided: flag it and wait.** `capabilities.consistentAcrossTabs` is `false` for `local` and `true` for every other
  driver. On a driver for which it is `false`, `update()` and `lock()` wait 5 ms after taking the lock before they
  read (4 ms removed the loss in every measurement, 0 ms did not). With the wait, 9600 overlapping updates per
  browser lost none in three runs. **This is a delay, not a guarantee**: data that has to survive concurrent updates
  of several tabs belongs in `indexeddb`. The "done when" of phase 1 holds for `local` only in that sense. `set()`
  and `delete()` do not wait; a `get()` right after another tab wrote can still return the old value on `local`.
- **A guarantee was considered and not built**: a revision counter per entry in IndexedDB that a locked read waits
  for. It needs a change of the entry format and an IndexedDB round trip per locked operation, for data that can
  live in IndexedDB in the first place.
- **The browser specs are not fully stable when Chromium, Firefox and WebKit run at once on the development
  machine**: in about 2 of 8 runs a second tab does not answer in time or Firefox does not connect. The same happens
  with the code of phase 1 alone (2 of 8), and not when one browser runs alone (Firefox 10 of 10, WebKit 14 of 14).
  Since phase 5 the three browsers run one after another (`maxWorkers: 1`), which failed in 1 of 12 runs: a second
  tab that never finished opening in Chromium. Opening the second tab now gives up a step after 5 seconds and tries
  again. Whether that removes the rest is not measured yet.

### Phase 3 (camera)

- **The "done when" of the phase is not reached yet.** It asks for the reference phones (one with iOS, an Android
  phone with one back camera, a multi-camera phone). What exists is verified against fakes that model those phones (two front and two back
  cameras, one torch that is reported late, one camera at a time, back cameras that need access for the back) and
  against the fake cameras of Chromium and Firefox, including a real second tab. The demo page (`pnpm demo`,
  `pnpm demo:lan` for phones, HTTPS with a self-signed certificate) is the tool for the rest;
  [`docs/device-matrix`](../device-matrix/README.md) says how to record a device and which questions the reports
  have to answer. No device is recorded.
- **Layout**: `media/camera/` with `model/`, `discovery/`, `controls/` and `session/`; the quirks in `media/quirks/`;
  `platform/device-platform.ts`. Published as `web-device-butler/camera`.
- **Base classes.** `MediaInputManager` gained `candidates()` (what a call chooses from; the camera looks at cameras
  there), `start()` (choose and start on a lease, used by `open()`, `switchTo()` and `autoRecover`) and
  `explainMismatch()`; `createSession()` receives the descriptor. `MediaSession` gained `replaceStream()` (same
  session, new track), `canRecover` / `recover()` and `abandon()`.
- **`CameraManager`** receives its collaborators as one `CameraManagerParts` object. `CameraManager.assemble()`
  builds them on shared parts and is what `Device.create()` uses; `CameraManager.create()` is the stand-alone factory.
- **`facing` is `'front' | 'back'`** in the requirements. On a device where no camera has that facing, the cameras
  that do not say where they face are used instead (a laptop still opens its webcam for `facing: 'back'`). A camera
  that is known to face the other way is never used.
- **`require` asks for features; `false` asks for nothing**, it does not exclude cameras that have the feature.
  Besides `torch`, `zoom` and `focus` there are `minResolution` and `minFrameRate`. A camera whose resolution the
  browser does not report is not ruled out by a resolution.
- **Probing.** The camera that the access request started is read first and not started again. Only cameras of a
  facing with access are started. A camera that does not start is left out and logged; the run goes on.
  `list({ detail: 'probed' })` looks at every camera, whatever the configuration prefers.
- **Late capabilities are not a quirk.** The hooks of `PlatformQuirk` are synchronous. `CameraCapabilityReader` asks
  a started camera until the torch is reported or the answer stayed the same for 200 ms, at most 1500 ms. A camera
  that is opened from a known descriptor only waits until it reports what the descriptor says. The times are
  guesses (`CameraTiming`) until the device matrix says more.
- **Cache.** One record in a library store (`local`, memory as fallback): the sorted ids of every listed camera and
  the cameras that were looked at. A different set of ids throws the record away. Labels are taken from the current
  list. `device.camera.forget()` clears it. Storage that fails means nothing is remembered; no call fails for it.
- **A camera that is opened by its `id` is not probed before**, and is described from its running track afterwards,
  which costs nothing. `session.descriptor` is therefore always `probed`.
- **Out-of-date cache.** `open()` looks at the cameras again and retries once only if the browser does not know the
  chosen camera (`NotFoundError`, or `OverconstrainedError` for `deviceId`), not for every failed selection.
  Otherwise each failing call would start every camera again.
- **Cameras that are held.** `select()`, `list({ detail: 'probed' })` and `initialize()` answer from what is known
  and remembered whenever the cameras are held, by another tab or by a session of the same `Device`. Only if nothing
  is known the busy policy applies. `initialize()` then reports the permission as `unknown`.
- **`initialize()`** returns `{ permission, cameras, selected, isResolutionAvailable, error }` and only throws for a
  call that was aborted. `Device.initialize()` covers the camera only; the microphone follows in phase 4.
- **Controls** read their state from the settings of the track and fall back to its constraints where a browser
  does not report a setting. `zoom.set()` and `focus.setDistance()` move a value outside of the range to its
  closest end. `FocusControl` has `setMode()` and `setDistance()`; the latter switches to the manual mode.
- **`switchTo()`** stops the running camera first, because a phone cannot run two. If no camera fits, the session
  returns to the camera it had; if that does not start either, it ends with the reason `device`. The `id` of the
  session is not kept for the next switch.
- **`autoRecover`** waits until the page is visible, keeps the lock meanwhile (a take-over still works) and reports
  the session as `muted` until the camera runs again. A camera that ends less than a second after it was started is
  not started again. The fallback of the risk "a background tab keeps its lock", a session that closes itself after
  some time in the background, is not built.
- **`settingschange`** is emitted after `configure()`, `switchTo()` and a recovery, not when the browser changes
  the picture on its own (for example when the device is turned).
- **The resolution is passed on as configured.** Whether a browser swaps width and height when the phone is held
  upright is still a question for the device matrix; selection compares resolutions independent of orientation.
- **Quirks.** `PlatformQuirks.for(platform, kind)`; the only quirk is `IosTorchResetsOnZoomQuirk`. `DevicePlatform`
  exists now in its minimal form (`isIos`, `isAndroid`) and is exposed as `device.platform`; phase 5 completes it.
- **`device.permission.request('camera')`** without a facing requests the configured facing.
- **Found in real browsers, for the device matrix:**
  - The fake camera of Firefox accepts a change of the resolution of a running track and keeps delivering the old
    one, also for `exact`. `session.settings` reports what is delivered. To be checked with a real camera.
  - The fake camera of Chromium reports focus modes and a focus distance, no facing, no torch and no zoom. The one
    of Firefox reports the facing `environment`.

### Phase 4 (microphone)

- **Verified** against fakes and against the fake microphones of Chromium and Firefox, including a real second tab
  and a recording of the combined stream with `MediaRecorder`. No real microphone and no phone was used; Safari is
  not verified. The demo page covers the camera only.
- **Layout**: `media/microphone/` with `model/`, `controls/`, `session/` and `level/`; `media/combined/` for
  `MediaManager` and `CombinedMediaSession`. Published as `web-device-butler/microphone`.
- **Features say whether a processing is available**, not whether it is on; `session.settings` and
  `session.processing` say that. Instead of `sampleRates` there are `maxSampleRate` and `maxChannelCount`. A
  processing that a running microphone has switched on counts as available, also in a browser that does not list it.
- **`isDefault`.** Chrome lists the default microphone a second time, as an entry with the id `default` (and
  `communications`). Those entries are removed and the microphone with the same `groupId` is marked. An entry that
  cannot be matched stays and is the default. Without such an entry the first microphone of the list is taken for
  the default; that is an assumption for Firefox and Safari.
- **Microphones are only started to look at them if features are asked for** (`require`, or `prefer` other than
  `default`) and the browser does not tell about the listed microphone. What a microphone reported is kept for the
  page, not stored. There is no `strategy`.
- **`require` / `prefer` versus `processing`.** `require` and `prefer` choose the microphone. `processing` says what
  the session starts with; a field that is not set leaves the decision to the browser.
- **Changing the processing of a running microphone.** Chromium accepts `applyConstraints` for it and changes
  nothing. `session.processing.set()` therefore checks what the microphone does afterwards and, if it did not
  follow and can, starts the same microphone again with the new processing: same session, new track
  (`trackchange`), a short gap, and a `MediaRecorder` on the stream stops. Changes run one after another.
- **`exclusive: true`** in the requirements takes the microphone lock exclusively; the default is shared, so several
  tabs and several sessions of one page record at once. Whether iOS allows that is a question for the device matrix.
- **`session.muted`** is the application silencing the microphone (`track.enabled`), with a `mutechange` event. It is
  not the `muted` state of the session, which is the system pausing the device.
- **`session.level`** is `undefined` where the browser has no Web Audio. It measures every 100 ms while someone
  listens to `change` and reports the root mean square of the signal, from 0 to 1. While the browser keeps the audio
  context suspended (a page nobody interacted with; observed in headless Firefox) nothing is reported, because the
  silence of a suspended context would look like a dead microphone.
- **`autoRecover`** works as for the camera. There is no `switchTo()` for microphones.
- **`CombinedMediaSession` is not a `MediaSession`.** That base class is one lease and one track. The combined
  session owns a `CameraSession` and a `MicrophoneSession`, has the same surface (`stream`, `state`, `close()`,
  `allowTakeover`, `statechange`, `ended`) and ends when either of them ends; `ended` names the `source`. Its
  `stream` stays the same object when a device gets a new track. `device.media.open()` opens the camera first and
  closes it again if the microphone fails.
- **Sessions emit `trackchange`** whenever they continue with a new track.
- **`Device.initialize()`** prepares the camera and then the microphone, one after the other, and reports each.
- **Found in real browsers, for the device matrix:**
  - Chromium does not change the processing of a running microphone (see above). When noise suppression and echo
    cancellation are switched off at the start, automatic gain control is reported as off as well.
  - The fake microphone of Firefox has no processing at all; the one of Chromium has all three and two channels.
  - Chromium's fake default entry has another `groupId` than its fake microphones, so it stays in the list.

### Phase 5 (location, platform, orientation)

- **Layout**: `location/` (published as `web-device-butler/location`) and `platform/` with `DevicePlatform` and
  `DeviceOrientation` (published as `web-device-butler/platform`). `Device` has `location`, `platform` and
  `orientation`.
- **`DeviceLocation`**: `current(options)` resolves with a `DevicePosition`, `watch(options)` returns a
  `LocationWatch`. Nothing is asked of the browser before one of them is called. The options are `highAccuracy`,
  `timeout` and `maximumAge`; `current()` also takes a `signal`. The browser cannot be told to stop determining a
  position, so an aborted call only stops waiting.
- **`LocationWatch`** emits `position` and `error` and keeps the last position. A problem does not end the watch,
  except a refused permission, after which nothing arrives. `device.dispose()` stops every watch.
- **`DevicePosition`** is a value class with the fields of the browser (what a device cannot tell is `undefined`,
  not `null`) and `distanceTo()`.
- **Errors**: `PermissionDeniedError` (`permission: 'geolocation'`), `LocationUnavailableError`,
  `LocationTimeoutError`, both extending `LocationError`, and `UnsupportedError` without a location or without
  HTTPS. `LocationErrorFactory` does the mapping.
- **`DeviceOrientation`** has `current` (`'portrait' | 'landscape'`, `undefined` without a page), the two getters
  and a `change` event. It watches the page only while someone listens. It follows the shape of the page, so
  a narrow desktop window counts as portrait.
- **`DevicePlatform`** stays as built in phase 3 (`isIos`, `isAndroid`).
- **Verified** against fakes; in real browsers only what needs no permission (orientation, platform, support of
  the location). A real position was not requested.

### Phase 6 (adapters and documentation)

- **Done**: the three adapters and [`README.md`](../../README.md). There are no generated API docs; the doc comments
  of the public interfaces are the reference.
- **The adapters live in `src/adapters/`**, not next to `src/`, so one build covers them. They are published as
  `web-device-butler/fabric`, `/inversify` and `/vue`; `fabric`, `inversify` and `vue` are optional peer
  dependencies.
- **fabric.** `FabricCameraFactory.create(session)` returns a `FabricCameraRenderer`. The renderer takes an open `CameraSession` and does not
  own it: torch, zoom and switching go through the session, and disposing the renderer leaves the camera running.
  The fitting of the picture is the value class `CameraCanvasLayout`.
- **`ZoomControl`** has `increase()`, `decrease()`, `isMinimum` and `isMaximum` in addition to what the plan lists.
- **inversify.** `DeviceContainerModule` takes a device that the application created and binds it and each of its
  parts under the typed identifiers of `DeviceBindings`. It does not create or dispose the device.
- **Vue.** `provideDevice` / `useDevice`, `useCamera`, `useMicrophone`, `useStoredValue`, `useOrientation` and
  `useLocation`. They are functions, as composables are by convention, and thin: state in refs, clean-up when the
  component is unmounted. Failures of `open()` and of storage calls end up in an `error` ref instead of being
  thrown. `useLocation` asks the browser nothing before `start()` is called.
- **Verified**: the adapters against fakes; the fabric renderer also with the real fabric in Chromium and Firefox,
  where it draws the fake camera into the canvas. The composables were not run inside a mounted component in a
  browser.

### After phase 6: interfaces

- **Deviates from "the public API consists of classes".** Every object the library hands out with behaviour (the
  device, the managers, sessions, controls, stores and watches) is an interface with the name the class had:
  `Device`, `CameraManager`, `CameraSession`, `Store`. The classes are named `Default...` (`DefaultDevice.create()`),
  the abstract bases `BaseMediaInputManager` and `BaseMediaSession`. An application types its code by the interfaces
  and a test can replace them; the names in the text above mean the interfaces.
- **What stays a class**: values (descriptors, features, settings, positions, errors) and what an application
  extends or implements itself (`EventEmitter`, `StorageDriver`, `PlatformQuirk`, `TrackControl`).
- **`Listenable`** is the interface of everything that emits; `EventEmitter` implements it.
- **Specs sit next to what they test.** A spec carries the name of the file whose class it tests
  (`default-device.spec.ts` for `default-device.ts`), one unit per file. The exceptions cover several classes on
  purpose: the `*.browser.spec.ts` files, which run an area in real browsers, and `media-gate.spec.ts`, which proves
  the access gate for every path through a manager.

## Open decisions

Recommendations are marked. None of them block phase 0.

1. **Where it is published** (npm, private registry, git dependency). The name is decided: `web-device-butler`, free on npm when checked on 2026-10-10 but not reserved.
2. **Fabric renderer**: ship it as `adapters/fabric` (recommended) or leave rendering to the
   application.
3. **Framework adapters**: ship Vue and inversify adapters in this repo (recommended as sub-paths) or leave
   integration to the app. The Vue adapter is the one place with free functions, because composables are functions by
   Vue's convention; they are thin wrappers around the classes.
4. **Browser baseline**: decides the OPFS worker fallback and how much effort goes into Firefox. Recommended: last two
   major versions of Chrome, Safari and Firefox, plus iOS Safari 17 and up.
5. **Validation**: no zod in core, optional validator in `JsonCodec` (recommended), or zod as a dependency.
6. **Scope after v1**: screen wake lock, vibration, network status, battery, clipboard, share and screen capture fit
   the same "device" theme. Not planned here; each would be one more manager class on `Device`.
