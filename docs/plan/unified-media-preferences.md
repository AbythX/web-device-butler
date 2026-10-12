# Plan: one shape for what is required and what is preferred

An application should describe the camera or microphone it wants once, in one vocabulary, and say for each
property whether the device **must** have it or whether it would **like** it:

```ts
await butler.camera.open({
  require: { facing: 'back' },
  prefer: { width: 1920, height: 1080, torch: true },
})
```

The same goes for the rest of the library: storage, location and the other sections take a `require` and a
`prefer` with the same two meanings, and the library respects both. A store can be opened without naming a
backend; the library then chooses one.

```ts
await butler.storage.open({
  namespace: 'recordings',
  require: { persistence: 'origin', binary: true },
  prefer: { streaming: true },
})
```

Implemented on the branch `unify-media-preferences`, with every decision taken as recommended; the table at the
end says which. [What was built differently](#what-was-built-differently) lists where the code left the plan.

The branch sits on top of `rename-to-butler`, so the names are the ones of that branch: `DefaultDeviceButler`,
`butler.prepare()`.

## Review: what is there today

`require` and `prefer` exist and work: `require` filters, `prefer` ranks, a `MediaRequirementsError` names which
requirement removed which device. What is not unified:

| Finding                                                    | Where                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| A resolution can be written in three places with three meanings: `resolution` (what the camera delivers, with `mode: 'ideal' \| 'exact'`), `require.minResolution`, `prefer.minResolution` | `camera-requirements.ts` |
| The same for the frame rate: `frameRate` and `minFrameRate` | `camera-requirements.ts`                                    |
| `facing` is neither required nor preferred: a field of its own that is required, with a fallback | `camera-requirements.ts`, `camera-selector.ts` |
| The example of this plan cannot be written in one place: the resolution is a top-level field, the torch is in `prefer` | |
| The microphone has two shapes: `prefer` has `default`, `require` does not | `microphone-requirements.ts`                   |
| The microphone has the processing twice: `require`/`prefer` say what it can do, `processing` what it does; likewise `minChannelCount` and `channelCount` | `microphone-requirements.ts` |
| The ranking has a tier that is not a preference in the API: "can deliver the configured `resolution`" comes after the count of preferred features | `camera-selector.ts` `compare()` |
| `prepare()` reports one preference that was not met (`isResolutionAvailable`) and none of the others | `camera-preparation.ts` |

The other sections have no `require` and `prefer` at all:

| Finding                                                    | Where                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| A store is opened by the name of a backend, or by a list of names that is tried in order. The application has to know which backend can do what; the library knows it (`StorageCapabilities`) but only reports it after the choice | `storage-manager.ts`, `default-storage-manager.ts` `selectDriver()` |
| A chain that ends in `memory` always opens. Whether the data survives a reload is something the application has to check afterwards | `docs/guides/storage.md` |
| The storage section of the configuration only has a `namespace` | `storage-configuration.ts`                              |
| Protection against eviction is a separate call, `persist()`, that no store asks for | `storage-manager.ts`                    |
| A position is returned however inaccurate it is. `highAccuracy` is a hint to the browser, and the first position a device gives is often a coarse one | `location-options.ts`, `default-device-location.ts` |
| There is no location section in the configuration            | `device-butler-configuration.ts`                                    |
| `butler.prepare()` prepares the camera and the microphone and nothing else | `device-butler.ts`, `default-device-butler.ts`            |
| Platform, orientation and coordination report and take no input | `device-platform.ts`, `device-orientation.ts`, `tab-coordination.ts` |

What already fits and stays: the split into filter and rank, the messages of the rejections, `strategy`, the
looking at cameras that the requirements can match, the cache.

## Proposed

### 1. One shape per device, used for both `require` and `prefer` (recommended)

```ts
interface CameraTraits {
  facing?: 'front' | 'back'
  torch?: boolean
  zoom?: boolean
  focus?: boolean
  /** in pixels */
  width?: number
  /** in pixels */
  height?: number
  frameRate?: number
}

interface MicrophoneTraits {
  default?: boolean
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  channelCount?: number
  sampleRate?: number
}

interface CameraRequirements extends MediaInputRequirements {
  require?: CameraTraits
  prefer?: CameraTraits
  strategy?: CameraSelectionStrategy
  autoRecover?: boolean
}

interface MicrophoneRequirements extends MediaInputRequirements {
  require?: MicrophoneTraits
  prefer?: MicrophoneTraits
  exclusive?: boolean
  autoRecover?: boolean
}
```

What is not a property of the device stays where it is: `id`, `whenBusy`, `signal`, `constraints`, `strategy`,
`exclusive`, `autoRecover`.

| Before                                          | After                                                        |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `facing: 'back'`                                | `require: { facing: 'back' }`, or `prefer` (new)             |
| `resolution: { width, height }`                 | `prefer: { width, height }`                                  |
| `resolution: { width, height, mode: 'exact' }`  | `require: { width, height }` (see 3)                         |
| `require: { minResolution: { width, height } }` | `require: { width, height }`                                 |
| `frameRate: 30`                                 | `prefer: { frameRate: 30 }`                                  |
| `require: { minFrameRate: 30 }`                 | `require: { frameRate: 30 }`                                 |
| `processing: { noiseSuppression: true }`        | `prefer: { noiseSuppression: true }` (see 4)                 |
| `channelCount: 2`, `sampleRate: 48000`          | `prefer: { channelCount: 2, sampleRate: 48000 }`             |
| `require: { minChannelCount: 2 }`               | `require: { channelCount: 2 }`                               |
| `CameraFeatureRequirements`, `ResolutionRequirement` | `CameraTraits`                                          |
| `MicrophoneFeatureRequirements`, `MicrophonePreferences`, `MicrophoneProcessing` (as input) | `MicrophoneTraits` |

The width and the height are traits of their own, on the same level as `frameRate` and `facing`; there is no
`resolution` object in what an application writes. What the library reports keeps its `Resolution`:
`features.maxResolution`, `features.resolutions` and `session.settings.resolution` are one value with `covers()`
and `pixels`, and taking them apart would only make them harder to compare.

### 2. What a trait means in each place

| Trait                         | In `require`: a device without it is never returned     | In `prefer`: among the devices that fit           |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `facing`                      | only that side. Where no camera says its side, the ones that do not say are used (as today) | that side first, then the cameras that do not say, then the other side |
| `torch`, `zoom`, `focus`      | the camera has it. `false` asks for nothing (as today)  | cameras that have it rank higher                  |
| `width`, `height`             | the camera can deliver at least this, whichever way the device is held (see below) | cameras that can deliver it rank higher |
| `frameRate`, `channelCount`, `sampleRate` | the device can deliver at least this        | devices that can rank higher                      |
| `default`                     | only the default microphone of the system               | the default microphone ranks higher (as today)    |
| processing                    | see 4                                                   | see 4                                             |

The preferred value is also what the running device is asked to deliver, the closest it can do. Where nothing is
preferred, the required value is asked for, trait by trait. So `require: { width: 1280, height: 720 }` with
`prefer: { width: 1920, height: 1080 }` reads as "at least 720p, 1080p if you can", and
`require: { width: 1920, height: 1080 }` alone gives a 1080p picture.

Width and height written together are one size: a phone that is held upright swaps them, so the longer sides and
the shorter sides are compared with each other, as `Resolution.covers()` does today. They count as one preference
in the ranking, not two.

Being separate traits, one can be written without the other, which is new: `require: { height: 1080 }`. A single
one is compared with the same side of the largest picture the camera reports, which browsers give for the device
held sideways, and the other side is left to the camera. Width and height can also be split between the two
places, `require: { height: 720 }` with `prefer: { width: 1920, height: 1080 }`.

Having a torch is not switching it on: `torch: true` never lights the torch. That stays with `session.torch`.

### 3. `mode: 'exact'` is dropped (recommended)

A required width and height are checked against what the camera says it can deliver, and then asked for as
`ideal`.
What is lost: where the browser does not say what a camera can deliver, `exact` made the browser refuse; and
`exact` refused a camera that can only deliver more. Both remain possible through
`constraints: { width: { exact: 1920 } }`.

`session.configure()` follows the traits: `configure({ width, height, frameRate })` instead of
`configure({ resolution, frameRate })`, without `mode`. It changes what the session prefers.

Alternative: keep the strictness as a trait, `require: { width, height, exactSize: true }`. One more field for a
case the escape hatch covers.

### 4. Microphone: `processing` moves into the traits (recommended)

`require: { noiseSuppression: true }` means: the microphone has it, and the session starts with it on.
`prefer: { noiseSuppression: true }` means: microphones that have it rank higher, and it is on where it exists.
`false` in either place switches it off and says nothing about which microphone is chosen. A field that is not set
leaves the decision to the browser, as today. If both places name the same processing, `require` wins.

```ts
await butler.microphone.open({
  prefer: { default: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
})
```

What is lost: asking for a microphone that has noise suppression and starting with it off, in one call. That is
`open({ require: { noiseSuppression: true } })` and then `session.processing.set({ noiseSuppression: false })`.

This is the one place where a boolean means more for a microphone (has it, and it is on) than for a camera (has
it). Alternative: leave `processing` as a field of its own and unify only the rest. Then the microphone keeps two
places for one word, which is what this plan sets out to remove.

### 5. Ranking

Camera, with the strategy `best`, in this order:

1. the preferred side
2. how many of the preferred `torch`, `zoom`, `focus` it has
3. whether it can deliver the preferred width and height
4. whether it can deliver the preferred frame rate
5. the largest zoom range, then the highest resolution, then the order of the list (as today)

For everything that can be written today the order is the same as today; the preferred side and the frame rate
are new. `first` stays: the first camera that has what is required, `prefer` is not looked at.

Microphone: how many of the preferred traits it has, then the default microphone, then the order of the list (as
today).

Alternative: one count over all preferred traits. Simpler to explain, but then a camera on the wrong side with a
torch ties with a camera on the right side without one.

### 6. A call still replaces `require` and `prefer` as a whole (recommended)

Today a field of a call replaces the configured field as a whole, so `open({ require: {} })` removes what the
configuration requires. That stays. It has a price that is larger than before, because more lives in `prefer`:
`open({ prefer: { zoom: true } })` drops a configured preferred width and height. The guides say so.

Alternative: merge `require` and `prefer` trait by trait. Then a configured trait needs a way to be removed
(`false` works for the booleans, the others would need `null`), and `switchTo({ require: { facing: 'front' } })`
would keep a required torch that no front camera has.

### 7. `prepare()` keeps `isResolutionAvailable` (recommended)

It then answers for the preferred width and height, or the required ones where none are preferred. Not added: a list of
every preference the selected camera lacks. The application has `selected.features` for that.

### 8. No compatibility layer (recommended)

The old fields are removed, not deprecated. Breaking for applications; the table in 1 is the migration.

## The other sections

### 9. The rule that holds everywhere (recommended)

Every section that takes input takes it in this form, in its section of the configuration (the defaults) and in
its calls (the overrides):

- `require`: what the result must have. The library never returns something without it; it fails with an error
  that says what was missing.
- `prefer`: what the result should have. The library gets as close as it can and reports what it ended up with.
- Everything else in the options says how to ask (`namespace`, `codec`, `timeout`, `signal`, `whenBusy`), not what
  to get.

Where there are several things to choose from (cameras, microphones, backends), `require` filters and `prefer`
ranks. Where there is one thing whose result varies (the position), `require` decides which results are let
through and `prefer` which one the library waits for.

The outcome of a selection (the candidates that fit, best first, and why the others do not) is the same idea for
cameras, microphones and backends. `MediaInputSelection` moves to `core/selection/` as the shared base, so the
message of an error reads the same everywhere.

### 10. Storage: the library chooses the backend (recommended)

```ts
interface StorageTraits {
  persistence?: 'page' | 'tab' | 'origin'
  binary?: boolean
  streaming?: boolean
  crossTabEvents?: boolean
  consistentAcrossTabs?: boolean
  persistent?: boolean
}

interface StoreOptions<T> {
  namespace: string
  codec?: Codec<T>
  /** by type: only these backends, in this order */
  driver?: string | readonly string[]
  require?: StorageTraits
  prefer?: StorageTraits
}

interface StorageConfiguration {
  namespace?: string
  driver?: string | readonly string[]
  require?: StorageTraits
  prefer?: StorageTraits
}
```

Two ways to say which backend, and they combine:

| Written                                                      | Chosen                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `driver: 'opfs'`                                             | by type: this backend or an error (as today)               |
| `driver: ['indexeddb', 'local']`                             | by type: the first that works here (as today)              |
| `require: { persistence: 'origin' }, prefer: { streaming: true }` | by traits: every registered backend is a candidate    |
| `driver: ['opfs', 'indexeddb'], require: { binary: true }`   | both: only the named backends, and only if they fit        |
| nothing                                                      | the default order                                          |

The traits are the fields of `StorageCapabilities`, which every backend already declares, custom ones included.

| Trait                  | In `require`                                              | In `prefer`                         |
| ---------------------- | --------------------------------------------------------- | ----------------------------------- |
| `persistence`          | exactly this lifetime. `tab` does not accept a backend that outlives the tab | backends with it rank higher |
| `binary`, `streaming`, `crossTabEvents`, `consistentAcrossTabs` | the backend has it. `false` asks for nothing | backends with it rank higher |
| `persistent`           | the browser has promised not to evict the data of the origin; refused, the store does not open | the promise is asked for; the store opens either way |

The order among the backends that fit and work in this browser:

1. how many of the preferred traits they have
2. the order of `driver`, where it is given
3. otherwise the default order: the longest lifetime first (`origin`, `tab`, `page`), then `indexeddb`, `opfs`,
   `local`, `session`, `memory`, then custom backends in the order they were registered

If none fits, the call rejects with a `StorageUnsupportedError` that says per backend what it lacks or that the
browser does not have it. `store.capabilities` says what was chosen, as today.

`persistent` is the one trait that belongs to the origin and not to a backend. It is asked for once, the first time
a store with it is opened or in `prepare()`, because some browsers show a prompt for it. `persist()` stays.

### 11. Location: `require` and `prefer` for the position (recommended)

There is nothing to choose among, so the traits describe the position that comes back:

```ts
interface LocationTraits {
  /** how far the real position may be from the reported one, in metres */
  accuracy?: number
  altitude?: boolean
  heading?: boolean
  speed?: boolean
}

await butler.location.current({
  require: { accuracy: 100 },
  prefer: { accuracy: 10 },
  highAccuracy: true,
  timeout: 15_000,
})
```

| Call        | `require`                                                         | `prefer`                                    |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `current()` | a position without it is not returned. The call keeps listening until one has it, or until the timeout, and then rejects with a `LocationRequirementsError` that carries the best position it saw | the call resolves at once with a position that has it. Otherwise it resolves at the timeout with the best position that has what is required |
| `watch()`   | positions without it are not announced                            | each position says whether it has what is preferred |

`highAccuracy`, `timeout`, `maximumAge` and `signal` stay as they are: they say how to ask. A location section is
added to the configuration for the defaults of every call.

A call that prefers something needs a `timeout`, or it could wait forever for a better position; without one the
first position that has what is required is returned.

### 12. `prepare()` covers every section (recommended)

It is the call for a set-up screen, and today it only knows the camera and the microphone. It prepares every
section that has an entry in the configuration, one after the other so the browser shows one prompt at a time, and
reports per section instead of throwing:

| Section      | What it does                                                    | What it reports                               |
| ------------ | --------------------------------------------------------------- | --------------------------------------------- |
| `camera`, `microphone` | as today                                              | as today                                      |
| `storage`    | chooses the backend the configuration asks for; asks for protection against eviction if `persistent` is required or preferred | the capabilities of the backend, whether the data is persistent, or the error |
| `location`   | requests the permission                                         | the state of the permission, or the error     |

The permissions follow from the sections, so there is no separate list of required and preferred permissions: a
camera section needs the camera permission, `persistent` needs `persistent-storage`. `butler.permission` stays the
way to ask for a single one.

### 13. Platform, orientation and coordination stay as they are (recommended)

They report facts and take no input, so there is nothing to choose and nothing the library could respect: it
cannot turn the device or change the system it runs on. An application that needs landscape or coordination across
tabs reads `butler.orientation` or `butler.coordination.isCrossTab` and decides itself.

Alternative: a top-level `require` in the configuration (`{ crossTab: true }`) that `prepare()` checks and
reports. One more place for something that is one `if` in the application.

## Consequences worth knowing before deciding

- **A preferred side looks at more cameras.** `require: { facing: 'back' }` never starts a front camera.
  `prefer: { facing: 'back' }` has to be able to fall back, so access is requested for the preferred side first and
  the other side is only requested and looked at if no camera of the preferred side has what is required.
- **A preferred channel count or sample rate can start microphones for a moment.** Today only `require` and
  `prefer` do that for a microphone the browser says nothing about; `channelCount` and `sampleRate` join them by
  moving into `prefer`.
- **A width without a height, or the reverse, is compared the way the browser reports the camera.** Written
  together they are compared whichever way the device is held; written alone, `width` means the long side of a
  phone. An application that cares about the way the device is held writes both.
- **`require: { default: true }`** is new and the same as `id: 'default'`. It exists so that both places have one
  shape.
- **`require: { sampleRate }`** is new: the descriptor already knows `maxSampleRate`.
- **A backend that is chosen automatically can be another one on the next visit.** The data of a store lives in
  its backend. If a browser gains or loses a backend, an application registers a new one, or the default order
  changes with a version of the library, the same `open()` lands elsewhere and finds the store empty. A list in
  `driver` has the same weakness today, but only the browser can trigger it. Moving data between backends is not
  part of this plan; an application that cannot afford it names one backend.
- **Without a required lifetime, an automatic choice can end in `session` or `memory`**, where a browser blocks
  the others. The data is then gone with the tab or the page. `require: { persistence: 'origin' }` rules that out.
- **Choosing by traits must not load every backend.** `opfs` and `indexeddb` are loaded on demand, and their
  capabilities are on the loaded driver. The manager needs them beforehand, next to the loaders, and asks the
  backends whether they work in ranked order, so only the code of the chosen one is loaded.
- **A required accuracy makes `current()` slower**, because the first position is often not good enough, and it
  keeps the receiver of the device running until the call ends.

## What changes in the code

| Area                | Files                                                                                   | Change |
| ------------------- | --------------------------------------------------------------------------------------- | ------ |
| Model               | `camera/model/camera-requirements.ts`, `microphone/model/microphone-requirements.ts`    | the traits; the old shapes and top-level fields go |
| Descriptors         | `camera-descriptor.ts`, `microphone-descriptor.ts`                                      | `missing(traits)` knows every trait; `unmet()` is `missing(require)` |
| Selection           | `camera/discovery/camera-selector.ts`, `microphone/model/microphone-selector.ts`        | the ranking of 5; `narrow()` and `facing()` read `require.facing` |
| Constraints         | `camera/session/camera-constraints.ts`, `microphone/session/microphone-constraints.ts`  | built from `prefer` over `require`, always `ideal` |
| Managers            | `default-camera-manager.ts`, `default-microphone-manager.ts`                            | access scopes from the required or preferred side; `isResolutionAvailable`; which traits make a microphone worth starting |
| Sessions            | `camera-session.ts`, `default-camera-session.ts`, `default-microphone-session.ts`       | `configure()` without `mode`; what `session.processing.set()` changed survives a restart |
| Exports             | `media/camera/index.ts`, `media/microphone/index.ts`                                    | new type names |
| Unchanged           | `base-media-input-manager.ts`, `media-input-requirements.ts`, the combined session, the Fabric and Inversify adapters | they pass requirements through |
| Selection, shared   | new `core/selection/`, `media/input/media-input-selection.ts`                           | the outcome of a selection for every section |
| Storage             | `storage-manager.ts`, `storage-configuration.ts`, `default-storage-manager.ts`, `storage-capabilities.ts`, a new `storage/selection/` | the traits; `driver` optional; ranking; capabilities known before a backend is loaded; `persistent` |
| Location            | `location-options.ts`, `default-device-location.ts`, `default-location-watch.ts`, a new `location/errors/location-requirements-error.ts` | the traits; `current()` listens until a position fits; the watch filters |
| Root                | `device-butler-configuration.ts`, `device-butler.ts`, `default-device-butler.ts`                             | a `location` section; `prepare()` for storage and location |
| Vue adapter         | `use-stored-value.ts`, `use-location.ts`                                                | pass `require` and `prefer` through |
| Specs, storage and location | the specs next to each file above, `storage-driver-contract.ts`, the browser specs | choosing by traits, by type and by both; a required lifetime that no backend has; a required accuracy that arrives late or never |
| Specs               | the specs next to each file above, `camera.browser.spec.ts`, `microphone.browser.spec.ts`, `media.browser.spec.ts`, `default-device-butler.spec.ts`, `use-camera.spec.ts`, the second-tab commands | rewritten to the new shape; new cases for a preferred side, a required and a preferred size together, a height without a width, `require` against `prefer` for a processing |
| Demos               | `demo/camera`, `demo/microphone`, `demo/storage`, `demo/location`, the four use cases   | the forms offer "must have" and "would like" per trait |
| Docs                | `README.md`, `docs/guides/camera.md`, `microphone.md`, `storage.md`, `location-orientation-permissions.md`, `getting-started.md`, the use cases | the tables of fields, the examples, a migration note |

`docs/plan/device-library.md` is the record of the first design and is left as it is.

## Order of work

1. `rename-to-butler` is not in `main` and touches the same files (the requirements, both managers, the rename of
   `initialize()`). This branch continues from it, so the two do not collide; `main` was left alone.
2. Model and descriptors, with their specs.
3. Selectors and constraints, with their specs.
4. Managers and sessions, with their specs and the browser specs.
5. The shared selection, then storage, with its specs. It does not depend on the steps before and can come first.
6. Location, with its specs.
7. `prepare()` for every section.
8. Exports, demos, guides, README.
9. The checks of the CI: lint, format, unit specs, browser specs.

Storage and location only add fields: `driver` becomes optional and nothing that can be written today changes its
meaning. The camera and the microphone are the breaking part.

## What was built differently

- **The rename branch was not merged into `main`.** This branch was moved onto `rename-to-butler` instead, which
  avoids the collision without changing `main`. Merging `rename-to-butler` first, then this branch, keeps the
  history in order.
- **A watch does not mark its positions.** Instead of each position saying whether it has what is preferred, a
  `DevicePosition` has `satisfies(traits)` and `missing(traits)`, which answer for any traits.
- **The location has no `prepare()` of its own.** `butler.prepare()` requests the permission through
  `butler.permission` and reports its state. The storage has one, `butler.storage.prepare()`, because choosing a
  backend is work of the storage manager.
- **`MediaInputSelection` stayed where it is** and extends the new `Selection` of `core/selection/`, which the
  selection of the storage backends extends too. Its public shape did not change.
- **A camera on a side that was refused is left out** when a side is only preferred, because it could not be
  started however high it ranks.
- **`session.processing.set()` drops the requirement for what it switched.** Otherwise a processing that was
  required and is switched off since would be switched on again when the microphone is started again.
- **The use case demos have no forms for the traits.** They show one fixed configuration each, which was moved to
  the new shape. The forms with "must have" and "would like" are on the pages of the camera, the microphone, the
  storage and the location.
- **The Vue adapter needed no change.** `useLocation()` passes its options on already, and a stored value is bound
  to a store that is open.
- **The migration is a guide of its own**, `docs/guides/migrating-to-require-and-prefer.md`.
- **What is preferred counts before the lifetime of a backend**, as section 10 says. A browser spec showed what
  that means: `prefer: { streaming: true }` alone takes `memory` in a browser without `opfs`. The guide says so.

## Decisions

Every decision was taken as recommended.

| #   | Question                                                                    | Decided                             |
| --- | --------------------------------------------------------------------------- | ----------------------------------- |
| 1   | The name of the shared shape                                                | `CameraTraits`, `MicrophoneTraits`. Others: `...Profile`, `...Wishes`, keep `...FeatureRequirements` |
| 2   | Does `facing` move into `require` and `prefer`?                             | yes                                 |
| 3   | `mode: 'exact'`                                                             | dropped                             |
| 4   | Does `processing` move into the traits?                                     | yes                                 |
| 5   | Ranking in tiers, or one count over all preferred traits                    | tiers                               |
| 6   | A call replaces `require` and `prefer` as a whole, or trait by trait        | as a whole                          |
| 7   | `isResolutionAvailable` stays, or a list of every preference that was not met | stays                             |
| 8   | Remove the old fields, or deprecate them for a release                      | remove                              |
| 7a  | What the library reports (`features.maxResolution`, `settings.resolution`) keeps its `Resolution`, or is flattened too | keeps it |
| 7b  | A width or a height written alone                                           | allowed, compared as the browser reports the camera. Other: both or neither, checked when the call is made |
| 9   | `rename-to-butler` into `main` before this is implemented                   | yes                                 |
| 10  | `driver` stays as the way to choose by type, next to `require` and `prefer` | yes. Other: `require: { driver }` and `prefer: { driver }` |
| 11  | The default order of the backends                                           | longest lifetime, then `indexeddb`, `opfs`, `local`, `session`, `memory` |
| 12  | May an automatic choice end in `session` or `memory` when no lifetime is required? | yes, and the guide says so. Other: `origin` unless the application says otherwise |
| 13  | `persistent` as a storage trait                                             | yes                                 |
| 14  | Location: a required and a preferred accuracy that `current()` waits for    | yes                                 |
| 15  | `altitude`, `heading`, `speed` as location traits                           | yes; they cost little once accuracy is there |
| 16  | `prepare()` for storage and location, permissions following from the sections | yes                            |
| 17  | Platform, orientation, coordination                                         | unchanged                           |
| 18  | One piece of work, or storage and location as a second one after the camera and the microphone | two, in the order above |
