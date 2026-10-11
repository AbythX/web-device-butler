# Set-up screen

**Goal.** The slow and visible work happens once, at a moment the user expects it: the permission prompts, and
finding the camera the application will use. When the user later presses "scan", the camera is on at once. Where
something is missing, the application says what and goes on without it.

**Demo.** `pnpm demo`: the `initialize()` buttons of `camera/` and `microphone/`, and the permission table of
`location/`.

## Why a screen for it

On the first visit, `device.camera.open()` with `require: { torch: true }` has to ask for permission and start
cameras one after another to find one with a torch. That takes a moment on a phone with several cameras, and a
prompt in the middle of a task gets refused more often than one the user was told about. The result is remembered,
so it is a first-visit cost. `initialize()` lets the application choose when to pay it.

## Showing what is needed

Before asking for anything:

```ts
for (const name of ['camera', 'microphone', 'geolocation'] as const) {
  showRow(name, await device.permission.query(name)) // never prompts
}
```

| State                  | The row shows                                                 |
| ---------------------- | ------------------------------------------------------------- |
| `granted`              | a check mark                                                  |
| `prompt`, `unknown`    | what the permission is for, and a button                      |
| `denied`               | how to unblock it in the settings of the browser              |
| `unsupported`          | that the feature is not available (no HTTPS, no such device)  |

`device.permission.on('change')` keeps the rows current when the user changes a permission in the browser.

## Asking

From the click on "Continue":

```ts
const { camera, microphone } = await device.initialize()
```

It asks one device after the other, so the browser shows one prompt at a time, and it does not throw: each device
reports for itself.

```ts
if (camera?.selected) {
  showReady(`Camera: ${camera.selected.label}`)
  if (camera.isResolutionAvailable === false) showNote('This camera cannot record in the configured resolution.')
} else {
  showProblem(explain(camera?.error))
}
```

```ts
const explain = (error: unknown): string => {
  if (error instanceof PermissionDeniedError) return 'The camera is blocked. Allow it in the settings of the browser.'
  if (error instanceof MediaRequirementsError) return 'This device has no camera with a torch.'
  if (error instanceof MediaDeviceNotFoundError) return 'This device has no camera.'
  if (error instanceof UnsupportedError) return 'Cameras are not available on this page.'
  if (error instanceof MediaDeviceBusyError) return 'The camera is in use. Close the other tab or application.'
  return 'The camera could not be started.'
}
```

Afterwards no camera runs. `device.camera.open()` starts the selected one without looking at the others.

## Only what the feature needs

```ts
await device.initialize({ camera: true }) // no microphone prompt for an application that only scans
await device.initialize({ camera: { facing: 'front', require: {} } }) // other requirements for this call
```

The location has no `initialize()`. Its prompt comes with the first `device.location.current()`, or earlier with
`device.permission.request('geolocation')`.

## Letting the user choose a camera

```ts
const cameras = await device.camera.list({ detail: 'probed' }) // looks at every camera

for (const camera of cameras) {
  addOption(camera.id, `${camera.label} (${camera.facing}${camera.features.torch ? ', torch' : ''})`)
}

device.camera.configure({ id: chosenId }) // open() uses it from now on
```

Store the id with the settings of the application. It is stable until the user clears the site data; an id that no
longer exists comes back as a `MediaDeviceNotFoundError` in the `error` of `initialize()`, which is the moment to
forget it.

## On later visits

Call `initialize()` again when the application starts a task that needs the camera. With the permission granted and
the cameras remembered it shows no prompt and starts no camera other than the selected one, and it notices what
changed: a revoked permission, a camera that was unplugged.

`device.camera.on('change')` reports cameras that are plugged in or removed while the application runs.

## Storage that stays

A set-up screen is also the place to ask the browser not to evict what the user will store:

```ts
const isPersistent = await device.storage.persist()
```
