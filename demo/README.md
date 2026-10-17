# Demos

Pages that run on the source of the library, for trying an area by hand and for collecting the
[device matrix](../docs/device-matrix/README.md).

```sh
pnpm demo       # https://localhost:5180
pnpm demo:lan   # also reachable from the phones in the same network; prints the address
```

The server uses a self-signed certificate, because browsers only hand out cameras over HTTPS. The browser warns
about it once.

## Pages

| Path                           | Shows                                                                                            | Described in                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `/`                            | the list of the pages                                                                            |                                                                                                            |
| `/camera/`                     | every camera with what the library found out, every call of a session, a report                  | [Camera](../docs/guides/camera.md)                                                                         |
| `/microphone/`                 | every microphone, processing, level, muting, the audio outputs, a report                         | [Microphone](../docs/guides/microphone.md)                                                                 |
| `/storage/`                    | drivers, entries, concurrent updates, locks, streams, space                                      | [Storage](../docs/guides/storage.md)                                                                       |
| `/location/`                   | positions, a watch, orientation, platform, every permission                                      | [Location, ...](../docs/guides/location-orientation-permissions.md)                                        |
| `/screen/`                     | the wake lock, fullscreen, the orientation lock, screen capture, what the page is told           | [Screen, ...](../docs/guides/screen-network-sharing.md)                                                    |
| `/sharing/`                    | the share sheet, the clipboard, saving and choosing files                                        | [Screen, ...](../docs/guides/screen-network-sharing.md), [Files, ...](../docs/guides/files-outbox-page.md) |
| `/network/`                    | the online state, the connection, an outbox with a server that can fail                          | [Screen, ...](../docs/guides/screen-network-sharing.md), [Files, ...](../docs/guides/files-outbox-page.md) |
| `/use-cases/document-scanner/` | a back camera with light and zoom, photos in the storage                                         | [Document scanner](../docs/use-cases/document-scanner.md)                                                  |
| `/use-cases/code-scanner/`     | codes from the back camera and from a picture, with zxing-wasm where the browser has no detector | [Code scanner](../docs/use-cases/code-scanner.md)                                                          |
| `/use-cases/voice-memo/`       | a microphone kept in the storage while it records                                                | [Voice memos](../docs/use-cases/voice-memo.md)                                                             |
| `/use-cases/video-message/`    | camera and microphone as one session that refuses a take-over while it records                   | [Video message](../docs/use-cases/video-message.md)                                                        |
| `/use-cases/shared-settings/`  | settings and counters that several tabs change at once                                           | [Settings in several tabs](../docs/use-cases/settings-across-tabs.md)                                      |
| `/use-cases/field-report/`     | a photo and a note that are kept without a network and sent once there is one                    | [Field report](../docs/use-cases/field-report.md)                                                          |

Nothing is requested from the browser before a button is pressed. Every page shows the log of the library at the
bottom, because a phone has no console.

## Things to try with two tabs

- `/storage/`: open the same store in both and press `update() 100 times` in both at the same moment. The counter
  ends at 200. With `get() then set()` it usually does not.
- `/storage/`: `lock() for 5 s` in one tab, `set()` and `set({ wait: false })` in the other.
- `/camera/`: open a camera in one tab, then `open()` in the other with each `When busy` policy. Uncheck
  `allowTakeover` in the first tab and try `takeover` again.
- `/use-cases/video-message/`: `Start and take over` in the second tab, once while the first tab shows the preview
  and once while it records.
- `/use-cases/shared-settings/`: change the theme in one tab and the name in the other.
- `/network/`: `open()` in both, uncheck `the server answers` in one and `add()` there. The other tab sends the item.

## Things to try without a network

Flight mode on a phone, or `Offline` in the network tools of a desktop browser.

- `/network/`: `add()` a few items, close the page, switch the network back on and `open()` again.
- `/use-cases/field-report/`: send a report, switch to another application in the middle of the next note and
  return. The note is still there, and the report leaves once the network is back.

## Layout

```
demo/
  index.html        the list of the pages
  shared/           the styles, the log on the page and the base class of the pages
  camera/           one folder per area: index.html and main.ts
  microphone/
  storage/
  location/
  screen/
  sharing/
  network/
  use-cases/        one folder per use case
  vite.config.ts
```

A page is a class that extends `DemoPage` (`shared/demo-page.ts`), which turns buttons into measured calls and
shows how they ended. A new page needs an element `status` and an element `log`, and a link on `index.html`.

The pages import from `../src`, not from the built package, so a change of the library shows after a reload. They
are type-checked and linted with the rest (`pnpm check`).
