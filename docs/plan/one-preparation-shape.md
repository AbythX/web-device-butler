# Plan: one shape for what `prepare()` reports

`butler.prepare()` asks for what an application will need, at a moment it chooses, and reports per part instead of
throwing. Each part reports in a shape of its own today, and the one question every application asks, "can I use
it?", is answered in two ways: the camera, the microphone and the storage say why not in `error`; the location and
the sensors only give a permission state, which the application has to interpret itself. The notifications cannot
be prepared at all.

After this change every report shares a base: `error` says why a part cannot be used, for every part, and
`permission` is there for every part that has a permission. `if (preparation.camera?.error)` and
`if (preparation.location?.error)` then mean the same.

Implemented on the branch `refactor-feature-support`, with every decision taken as recommended. [What was built
differently](#what-was-built-differently) lists where the code left the plan. The change of the public API only adds: a field to the reports of the location and the
sensors, and the notifications as a part to prepare.

## Review: what is there today

| Part | Option | Report | Fields | Prepared by |
| ---- | ------ | ------ | ------ | ----------- |
| storage | `boolean \| StorageRequirements` | `StoragePreparation` | `capabilities?`, `isPersistent`, `error?` | `storage.prepare()` |
| camera | `boolean \| Partial<CameraRequirements>` | `CameraPreparation` | `permission`, `cameras`, `selected?`, `isResolutionAvailable?`, `error?` | `camera.prepare()` |
| microphone | `boolean \| Partial<MicrophoneRequirements>` | `MicrophonePreparation` | `permission`, `microphones`, `selected?`, `error?` | `microphone.prepare()` |
| location | `boolean` | `LocationPreparation` | `permission` | the butler, inline: `permission.request('geolocation')` |
| motion | `boolean` | `MotionPreparation` | `permission` | the butler, inline: `permission.request('motion')` |
| notifications | — | — | — | not preparable |

| Finding | Where |
| ------- | ----- |
| A camera that cannot be used reports `permission: 'unsupported'` **and** an `UnsupportedError`, a refused one `permission: 'denied'` **and** a `PermissionDeniedError`; a location that cannot be used only reports `permission: 'unsupported'` or `'denied'` | `base-media-input-manager.ts:298`, `default-device-butler.ts:241-246` |
| Five `if` blocks, one per part, in the order the prompts are shown | `default-device-butler.ts:222-249` |
| `permission` and `error` are declared in each report again | `camera-preparation.ts`, `microphone-preparation.ts`, `storage-preparation.ts`, `location-preparation.ts`, `motion-preparation.ts` |
| Notifications need a permission like the location and the sensors, but `prepare()` cannot ask for it | `device-butler.ts` |

## Design

### Two base reports

```ts
// core/preparation/preparation.ts
/**
 * What `prepare()` found out about one part. It reports instead of throwing, so an application can go on without
 * the part.
 */
export interface Preparation {
  /** why the part cannot be used; `undefined` where it can */
  readonly error?: DeviceButlerError
}

// permission/permission-preparation.ts
export interface PermissionPreparation extends Preparation {
  /** the permission of the part after it was asked for; `unsupported` where the part does not exist here */
  readonly permission: DevicePermissionState
}
```

| Report | Becomes |
| ------ | ------- |
| `StoragePreparation` | `extends Preparation`; its fields stay. The storage has no permission of its own: `isPersistent` stays its answer. |
| `CameraPreparation`, `MicrophonePreparation` | `extend PermissionPreparation`; their fields stay |
| `LocationPreparation`, `MotionPreparation` | `PermissionPreparation`, kept as names; they gain `error` |
| `NotificationPreparation` | new, `PermissionPreparation` |

### The same `error` for a permission

A part that is prepared through its permission alone reports what the camera reports for the same answer:

| Permission after asking | `error` |
| ----------------------- | ------- |
| `granted`, `prompt`, `unknown` | `undefined` |
| `denied` | `PermissionDeniedError` naming the permission |
| `unsupported` | `UnsupportedError` naming the part |

`prompt` stays without an error: in Safari a permission asked for without a click stays `prompt`, and asking again
in answer to a click can still grant it.

### The butler prepares from one list

```ts
// one entry per part, in the order the browser shows the prompts
const parts = [
  ['storage', (option) => this.storage.prepare(…)],
  ['camera', (option) => this.camera.prepare(…)],
  ['microphone', (option) => this.microphone.prepare(…)],
  ['location', () => this.preparePermission('geolocation', 'geolocation')],
  ['motion', () => this.preparePermission('motion', 'motion')],
  ['notifications', () => this.preparePermission('notifications', 'Notification')],
]
```

`preparePermission(name, feature)` requests the permission through the permission manager, as today, and turns the
answer into a `PermissionPreparation` by the table above. The parts keep one after the other, so the browser shows
one prompt at a time.

### Notifications

`prepare({ notifications: true })` requests the permission to show notifications. Like the sensors, Safari and
Firefox only ask in answer to a click. `prepare()` without options does not include them, as before: the
configuration has no section for the notifications that could ask for it.

### Documentation

| File | What changes |
| ---- | ------------ |
| `docs/guides/getting-started.md` | the section on `prepare()`: one `error` for every part, notifications |
| `docs/guides/location-orientation-permissions.md` | `prepare({ motion: true })` reports `error` too |
| `docs/guides/notifications-vibration.md` | `prepare({ notifications: true })` |
| `docs/guides/errors.md` | the line on what `prepare()` reports names every part |
| `docs/use-cases/set-up-screen.md` | checked; the location gains an `error` |

## Steps

One commit each; every step leaves the specs green.

1. `Preparation` and `PermissionPreparation`; the five reports declared with them, without changing a field.
2. `preparePermission()`: the location and the sensors gain `error`.
3. The butler prepares from one list.
4. `prepare({ notifications: true })` and `NotificationPreparation`.
5. The guides and the use case.

## Decisions

| Decision | Recommendation |
| -------- | -------------- |
| Should `error` be set for the location and the sensors, which only report a permission today? | **Yes.** It is the point of the change: one check for every part. It only adds a field. |
| Should `prompt` count as an error? | **No.** A permission asked without a click can stay `prompt` in Safari and still be granted later. |
| Give the location, the sensors and the notifications a `prepare()` of their own, like the camera? | **No.** Their preparation is the request of their permission, which the permission manager owns; a `prepare()` on each part would have to reach the manager from parts that are also created without the butler. The butler keeps preparing them. |
| Prepare the notifications? | **Yes, when asked for**, not by default. |
| Further parts that have a permission (wake lock, reading the clipboard, persistent storage)? | **No.** The wake lock and the clipboard are asked for when they are used; persistent storage is part of preparing the storage. |

## What was built differently

| Plan | Built | Why |
| ---- | ----- | --- |
| One list of `[part, prepare]` pairs | a typed map from each part to how it is prepared, and a separate list of the order | a pair list loses the type of each option and report; the map keeps them, and the order stays one line to read |
| `UnsupportedError` naming the part | `geolocation`, `motion` and `Notification` | the names the parts already use in their own `UnsupportedError`, except the sensors, which have two events and are named as one part |
