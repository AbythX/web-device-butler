# Plan: name the root object after the library

The library is called `web-device-butler`, but its root object and everything around it was called `Device`. That name
was used for two different things: the object an application creates, and the physical device the user holds
(`DeviceLocation`, `MediaDeviceBusyError`). This plan separates the two: the root object is the `DeviceButler`, what
belongs to it carries that name as its prefix, and what stands for the hardware stays a `Device`.

## The rule

- The root object is the `DeviceButler`, implemented by `DefaultDeviceButler`.
- A name whose `Device` means "of this library" gets the prefix `DeviceButler` instead.
- The class that wraps the global scope of the browser is named after what it wraps: `BrowserEnvironment`.
- A name whose `Device` means the phone, the camera or the microphone stays as it is.
- The package name, the sub-path exports and every name written to the browser stay as they are.

## Renamed

| Before                                    | After                                                       | Entry point  |
| ----------------------------------------- | ----------------------------------------------------------- | ------------ |
| `Device`                                  | `DeviceButler`                                              | core         |
| `DefaultDevice`                           | `DefaultDeviceButler`                                       | core         |
| `DeviceConfiguration`                     | `DeviceButlerConfiguration`                                 | core         |
| `DeviceInitializeOptions`                 | `DeviceButlerPrepareOptions`                                | core         |
| `DeviceInitialization`                    | `DeviceButlerPreparation`                                   | core         |
| `DeviceError`                             | `DeviceButlerError`                                         | core         |
| `DeviceEnvironment`                       | `BrowserEnvironment`                                        | core         |
| `DeviceGlobals`                           | `BrowserGlobals`                                            | core         |
| `DeviceBindings`, `DeviceBindings.Device` | `DeviceButlerBindings`, `DeviceButlerBindings.DeviceButler` | `/inversify` |
| `DeviceContainerModule`                   | `DeviceButlerContainerModule`                               | `/inversify` |
| `useDevice`, `provideDevice`              | `useDeviceButler`, `provideDeviceButler`                    | `/vue`       |
| `deviceInjectionKey`                      | `deviceButlerInjectionKey`                                  | `/vue`       |

The files follow their classes: `core/device-butler.ts`, `core/default-device-butler.ts`, `core/device-butler-configuration.ts`,
`core/environment/browser-environment.ts`, `core/errors/device-butler-error.ts`, `adapters/inversify/device-butler-bindings.ts`,
`adapters/inversify/device-butler-container-module.ts`, `adapters/vue/use-device-butler.ts`, each with its spec.

Variables, fields and prose follow as well: `const butler = DefaultDeviceButler.create()`, `butler.camera.open()`,
`this.butler` in the demos, "create the butler once" in the guides.

## Kept

| Name                                                                      | Why                                                                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `DeviceLocation`, `DevicePosition`, `DevicePlatform`, `DeviceOrientation` | where the device is, what it runs, how it is held                                               |
| `MediaDeviceBusyError`, `MediaDeviceNotFoundError`                        | a camera or a microphone                                                                        |
| `DevicePermissionName`, `DevicePermissionState`, `DevicePermissionChange` | what the user allowed on the device; the prefix also keeps them apart from the types of the DOM |
| the session end reason `'device'`                                         | the hardware ended the session                                                                  |
| `web-device-butler` as lock, channel, database, directory and key prefix  | stored data and running tabs of an earlier version keep working                                 |
| `docs/plan/device-library.md`                                             | the record of the original design, with the names of its time                                   |

## What changes for an application

Everything in the first table is public, so this is a breaking change. Two identifiers change their value and not
only their name, which matters where two copies of the library meet in one application:

- the inversify identifier of the root object: `Symbol.for('web-device-butler:Device')` is now `...:DeviceButler`
- the Vue injection key: `Symbol.for('web-device-butler:device')` is now `...:device-butler`

Nothing that is persisted or shared between tabs changes.

## Steps

1. Move the files with `git mv`, so the history follows them.
2. Rename the types and the adapter functions, and the import paths.
3. Rename the variables, fields and parameters that hold the root object. A `device` that is a `MediaDeviceInfo`
   stays.
4. Rewrite comments, test names, error messages and the guides where "the device" meant the root object.
5. `pnpm check`: format, lint, types, tests, build.

## Decided

- The root object is `DeviceButler`, not `Butler`: it says more where the import is not visible.
- `BrowserEnvironment` instead of `ButlerEnvironment`: it describes what the class wraps.
- What belongs to the butler has the full prefix `DeviceButler`, not the short `Butler`, so there is one form to
  remember. The variable that holds the object is still `butler`.
- `initialize()` is `prepare()`; see [the vocabulary of a butler](butler-vocabulary.md).

## Open

- No aliases under the old names are kept. The package is at `0.0.0`; if an application already depends on it,
  deprecated re-exports for one release would soften the change.
