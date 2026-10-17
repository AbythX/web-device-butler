# Documentation

Start with the [README](../README.md) for a tour of the API in one page. The rest is here.

## Guides

One per area: what the area does for you, the calls in the order you need them, and what to watch out for.

| Guide                                                                           | Covers                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Getting started](guides/getting-started.md)                                    | creating the butler, configuration, lifetimes, events, logging     |
| [Camera](guides/camera.md)                                                      | requirements, selection, sessions, torch, zoom, focus, photos, switching |
| [Microphone](guides/microphone.md)                                              | selection, processing, level, muting, both at once, audio outputs  |
| [Recording](guides/recording.md)                                                | formats, pausing, segments, writing into the storage as a stream   |
| [Screen capture](guides/screen-capture.md)                                      | the picker, what is preferred and required, the session, recording with a voice |
| [Code scanning](guides/code-scanning.md)                                        | decoders, scanning a camera, regions, reading a picture, a decoder of your own |
| [Storage](guides/storage.md)                                                    | drivers, stores, codecs, expiry, streams, space                    |
| [Location, orientation, platform, permissions](guides/location-orientation-permissions.md) | positions, watches, how the device is held, permission screens |
| [Screen, network, sharing](guides/screen-network-sharing.md)                    | wake lock, fullscreen, orientation lock, online state, share sheet, clipboard |
| [Files, the outbox, the page](guides/files-outbox-page.md)                      | saving and choosing files, sending once there is a network, a page that goes away |
| [Several tabs](guides/multiple-tabs.md)                                         | what the tabs of an application share and how the library coordinates it |
| [Errors](guides/errors.md)                                                      | every error class, when it is thrown and what to tell the user     |
| [Migrating to `require` and `prefer`](guides/migrating-to-require-and-prefer.md) | what changed in what an application asks of a camera or a microphone |

## Use cases

Complete, small solutions for things applications actually build. Most of them run as a demo.

| Use case                                                         | Shows                                                        | Demo                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| [Document scanner](use-cases/document-scanner.md)                | camera by features, torch, zoom, photos in the storage       | `use-cases/document-scanner/`    |
| [Voice memos](use-cases/voice-memo.md)                           | microphone, level, recording into the storage as a stream    | `use-cases/voice-memo/`          |
| [Video message](use-cases/video-message.md)                      | camera and microphone as one session, no interruption while recording | `use-cases/video-message/` |
| [Settings in several tabs](use-cases/settings-across-tabs.md)    | change events, updates that survive concurrent tabs, Vue     | `use-cases/shared-settings/`     |
| [Field report](use-cases/field-report.md)                        | a photo of the camera application, the outbox, a note that survives the page | `use-cases/field-report/` |
| [Set-up screen](use-cases/set-up-screen.md)                      | permissions and device discovery before the user needs them  | `camera/`, `microphone/`, `location/` |
| [Camera with an overlay](use-cases/camera-with-overlay.md)       | the fabric adapter, recording the picture with the overlay   |                                  |
| [Recording a route](use-cases/track-a-route.md)                  | following the position, distance, storing the points         | `location/`                      |
| [Screen tutorial](use-cases/screen-tutorial.md)                  | a capture of the screen and the microphone in one recording  | `screen/`                        |
| [Code scanner](use-cases/code-scanner.md)                        | QR codes and bar codes from the camera and from a picture, zxing-wasm | `use-cases/code-scanner/` |

## Demos

`pnpm demo` serves the pages of [`demo/`](../demo/README.md) over HTTPS; `pnpm demo:lan` makes them reachable from a
phone in the same network. The path in the table above is the path below the address the command prints.

## Background

| Document                                         | Contains                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| [Device matrix](device-matrix/README.md)         | what real devices do, and how to collect a report with the demo pages |
| [Plan: new parts](plan/device-features.md)       | screen capture, recordings that survive the page, scanning, motion, notifications |
| [Later](plan/later.md)                           | parts that would fit but are not planned yet, and what was left out  |
