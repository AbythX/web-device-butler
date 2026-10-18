# Plan: one fake origin for the specs

Specs that need more than one tab fake a browser: tabs of one origin share the locks, the `localStorage` and the
broadcast channels, and each tab has its own `sessionStorage`. Two fakes build that origin, and one spec builds it a
third time by hand. Each copy sets up the shared parts again, with its own counter that keeps the broadcast channels
of two fakes apart, since `BroadcastChannel` is global to the process.

After this change one `FakeOrigin` in `core/testing/` owns what every tab of an origin shares. The fakes of the
storage and of the media add only what is theirs, and can share one origin where a spec needs both.

Implemented on the branch `refactor-feature-support`, with every decision taken as recommended. [What was built
differently](#what-was-built-differently) lists where the code left the plan. Only specs and their fakes change; nothing of the library or its published types does.

## Review: what is there today

### What each fake sets up

| | `storage/testing/fake-browser.ts` (`FakeBrowser`) | `media/testing/fake-media-browser.ts` (`FakeMediaBrowser`) | `attention/notifications/default-device-notifications.spec.ts` |
| - | --- | --- | --- |
| locks shared by the tabs | `InTabLockManager` | `InTabLockManager` | — |
| `localStorage` shared by the tabs | `FakeStorage` | `FakeStorage` | — |
| `sessionStorage` per tab | `FakeStorage` | — | — |
| broadcast channels of this origin only | prefix with a counter of its own | prefix with a counter of its own | prefix with a counter of its own |
| globals a spec adds | `sharedGlobals` | `globals` | `globals` |
| tabs closed by `close()` | the storage managers | the access gates and channels | `afterEach` of the spec |
| its own parts | file system, IndexedDB, `navigator.storage`, estimate, persistence | devices, the audit of the locks, `FakePermissions`, `navigator` identity, `AudioContext`, `MediaStream` | `Notification`, service worker, `window.focus` |

### Who uses them

| Fake | Specs |
| ---- | ----- |
| `FakeBrowser` | 5: storage manager, store, `useStoredValue` of Vue, the probe cache of the camera, kept recordings |
| `FakeMediaBrowser` | 21, among them the butler, the permission manager and the Fabric adapter |

| Finding | Where |
| ------- | ----- |
| The prefix of the broadcast channels is built three times, with three counters | `fake-browser.ts:32`, `fake-media-browser.ts:46`, `default-device-notifications.spec.ts:58` |
| `FakeBrowser` is named like the browser of every part but only fakes the storage | `storage/testing/fake-browser.ts` |
| A spec that needs the storage and the media of one origin cannot have both: the kept recordings build a second environment by hand for the locks of the media | `media/recording/kept/kept-recording.spec.ts:74-89` |

## Design

```ts
// core/testing/fake-origin.ts
/**
 * One origin in one browser, for specs: every tab opened from it shares the locks, the `localStorage`, the
 * permissions and the broadcast channels, and has its own `sessionStorage`.
 */
export class FakeOrigin {
  public readonly locks = new InTabLockManager()
  public readonly localStorage = new FakeStorage()
  public readonly permissions = new FakePermissions()

  /**
   * The environment of a new tab. `navigator` is merged with the shared one; every other global replaces it.
   */
  public openEnvironment(globals?: Partial<BrowserGlobals>): BrowserEnvironment

  /**
   * Ends what a tab opened, when the origin is closed.
   */
  public onClose(end: () => void): void

  public close(): void
}
```

- `FakeStorage` moves from `storage/testing/` to `core/testing/`, since the origin owns it now; seven files import it.
- `FakeStorageBrowser` (renamed from `FakeBrowser`) and `FakeMediaBrowser` take an origin, a new one by default,
  and pass their parts to `openEnvironment()`: `navigator.storage` and IndexedDB; `navigator.mediaDevices`,
  `AudioContext` and `MediaStream`. Their `locks`, `localStorage` and `permissions` are those of the origin.
- `openTab()` of both stays as it is; each registers what its tab opened with `onClose()`.
- The notifications spec opens its tabs from a `FakeOrigin`.
- Each fake keeps what is particular to it: the storage tabs keep their in-tab locks of their own (each tab is a
  realm of its own), the media keeps its audit of the locks.

## Steps

One commit each; every step leaves the specs green.

1. `FakeOrigin` with a spec: two tabs share the locks, the `localStorage` and the channels, two origins do not, each
   tab has its own `sessionStorage`, and `navigator` is merged. `FakeStorage` moves to `core/testing/`.
2. `FakeMediaBrowser` builds on it.
3. `FakeBrowser` builds on it and is renamed `FakeStorageBrowser`; its five specs follow.
4. The notifications spec opens its tabs from a `FakeOrigin`.
5. The kept recordings open the storage and the media of one origin instead of a second environment.

## Decisions

| Decision | Recommendation |
| -------- | -------------- |
| Rename `FakeBrowser` to `FakeStorageBrowser`? | **Yes.** Next to `FakeMediaBrowser` and `FakeOrigin`, a fake that only knows the storage should say so. Five specs import it. |
| One fake browser for every part instead of an origin with a fake per part? | **No.** The parts of the storage and of the media have nothing in common but the origin; a single fake would mix a file system, IndexedDB, cameras and the audit of their locks in one class. |
| Move the permissions to the origin? | **Yes.** They belong to the origin in a browser; the media fake keeps reaching them as `browser.permissions`. |
| Fix the flaky specs with a second tab? | **No, not here.** They run against real tabs of Playwright (`core/testing/second-tab.ts`), not against these fakes. |

## What was built differently

| Plan | Built | Why |
| ---- | ----- | --- |
| `openEnvironment(globals)` merges `navigator` | `openEnvironment(parts, overrides)`: the `navigator` of the parts of a fake is merged with the shared one, the overrides of a spec replace it | the media specs pass `{ navigator: {} }` to fake a browser without devices; merging it would have kept the devices and changed what those specs test |
| A spec of the kept recordings with the storage and the media of one origin | left as it is | its second environment does not stand for another part: it hands each tab a lock manager that records the locks of that tab. There is nothing to combine. |
| The local storage of the origin given to the storage fake | the storage fake takes an origin, and a spec with a limited `localStorage` builds that origin: `new FakeStorageBrowser({}, new FakeOrigin(new FakeStorage(200)))` | the origin owns the `localStorage` now |
| `FakeMediaBrowser` keeps a list of its tabs | each tab registers its end with the origin | the origin closes the tabs of every fake that shares it |
