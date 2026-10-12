# Several tabs

Users open an application twice. Without coordination that goes wrong in ways that are hard to reproduce:

- Both tabs read a stored value, change it and write it back. One change is lost.
- One tab deletes a recording that the other tab is still writing.
- The second tab starts the camera. On a phone that stops the camera of the first tab, without an error on either
  side.
- Both tabs start every camera to find out what it can do, at the same time, and make each other fail.

The library coordinates every tab of the origin that uses it. Nothing has to be switched on.

Try it: open any page of `pnpm demo` in two tabs. `storage/`, `use-cases/shared-settings/` and
`use-cases/video-message/` are built for it.

## How far it reaches

```ts
butler.coordination.isCrossTab
```

`true` where the browser has the Web Locks API, which is every current browser. Where it is `false`, access is only
coordinated inside the tab, and the library logs that once.

The coordination covers tabs of the same origin that use this library. A native application or another site that
holds the camera is outside of it; the browser reports that as a `MediaDeviceBusyError` with `holder: 'unknown'`, or
as a session that turns `muted` or ends.

The browser releases the locks of a tab that is closed or crashes, so nothing stays locked behind it.

## Storage

| Call                          | With several tabs                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `get()`                       | sees the old value or the new one, never a partial write                             |
| `set()`, `delete()`           | one step each. Two tabs that set the same key overwrite each other, the last one wins. |
| `update()`                    | read, change and write as one step: two tabs that increment the same value both count |
| `lock()`                      | no other tab can write the entry while the task runs                                 |
| `writeStream()`, `readStream()` | the entry cannot be written or deleted until the stream is closed                  |
| `on('change')`                | reports the changes of other tabs with `origin: 'remote'`                            |

A write that meets an entry in use waits; with `{ wait: false }` it fails with a `StorageLockedError`.

Rules of thumb:

- **Never read and then `set`** a value that another tab may change. Use `update()`.
- **Render from the store, re-render on `change`.** Then every tab shows the same without knowing about the others.
- **Shared, concurrently updated data goes into `indexeddb` or `opfs`.** `localStorage` reaches the other tabs with
  a delay in Firefox and Safari (`capabilities.consistentAcrossTabs === false`).
- `session` and `memory` are per tab by nature. They report no remote changes and need no coordination.

After a deployment, tabs can run different versions of the application. A tab that reads an entry in a newer format
of the library than it knows fails with a `StorageVersionError` and leaves the entry untouched.

## Camera and microphone

Only one tab can run a camera. What happens when another tab holds it is a policy, in the configuration or per
call:

```ts
await butler.camera.open({ whenBusy: 'fail' }) // default
await butler.camera.open({ whenBusy: 'wait', signal })
await butler.camera.open({ whenBusy: 'takeover' })
```

| `whenBusy`   | The call                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `fail`       | rejects right away with a `MediaDeviceBusyError`. `holder` is `'other-tab'` or `'this-tab'`.       |
| `wait`       | resolves once the holder closes its session. An `AbortSignal` stops waiting.                       |
| `takeover`   | asks the holder to release. Its session ends with the reason `'taken-over'`, then the call resolves. If the holder refuses or does not answer in time, the call rejects with a `MediaDeviceBusyError`. |

The usual flow is to fail first and let the user decide:

```ts
try {
  session = await butler.camera.open()
} catch (error) {
  if (error instanceof MediaDeviceBusyError && error.holder === 'other-tab') {
    if (await confirm('The camera runs in another tab. Use it here?')) {
      session = await butler.camera.open({ whenBusy: 'takeover' })
    }
  } else {
    throw error
  }
}
```

A session that must not be interrupted refuses:

```ts
session.allowTakeover = false // while recording
```

And the tab that lost its camera hears about it:

```ts
session.on('ended', ({ reason }) => {
  if (reason === 'taken-over') showNotice('The camera is used in another tab now.')
})
```

The state is observable without opening anything:

```ts
butler.camera.availability // 'free' | 'held-by-this-tab' | 'held-by-other-tab'
butler.camera.on('availabilitychange', (availability) => {})
```

Finding out what the cameras can do never interrupts another tab. While another tab holds the camera, `list({ detail:
'probed' })`, `select()` and `prepare()` answer from what is remembered; only if nothing is remembered does the
busy policy apply.

**Microphones** can be shared: by default every tab gets its own session. `exclusive: true` makes a microphone
session behave like a camera session towards the other tabs.

## The same tab

A second `butler.camera.open()` while a session of the same `DeviceButler` runs fails with `holder: 'this-tab'`: close the
session first, or use `session.switchTo()`.

Locks are identified by name, not by tab, so two `DeviceButler` objects in one tab are coordinated like two tabs, and
report each other as `'other-tab'`. Another reason to create one butler and share it.
