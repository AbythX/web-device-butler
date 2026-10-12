# Screen, network, sharing

The smaller parts around a capture screen: keeping the screen on, filling it, knowing whether there is a network,
and handing a result over to another application.

Try it: `pnpm demo`, pages `screen/`, `network/` and `sharing/`.

## Keeping the screen on

A camera preview, a recording or a route that is followed is of little use on a screen that went dark.

```ts
using hold = await butler.wakeLock.request()

// the screen stays on until the hold is released
```

- A browser drops its wake lock whenever the page goes to the background and does not take it again by itself.
  `butler.wakeLock` does: as long as a hold is out, the screen is kept on whenever the user can see the page.
- Several holds can be out at once. The screen is kept on until the last one is released, so two parts of an
  application do not have to know of each other.
- `isRequested` says whether a hold is out, `isActive` whether the browser keeps the screen on right now, which it
  does not while the page is in the background. `change` announces the latter.
- `isSupported` is `false` where the browser cannot keep the screen on. `request()` fails with an
  `UnsupportedError` there, and with a `PermissionDeniedError` where the browser refuses, for example while the
  device saves energy.
- A recording asks for it itself with [`keepAwake: true`](recording.md#while-it-runs).

In Vue and React, `useWakeLock(butler.wakeLock)` gives a component a hold of its own that is released when it is
unmounted. `butler.permission.query('screen-wake-lock')` says beforehand whether the browser lets the page.

## Filling the screen

```ts
button.addEventListener('click', async () => {
  if (butler.fullscreen.canEnter(preview)) {
    await butler.fullscreen.enter(preview)
  }
})

butler.fullscreen.element // what fills the screen, or undefined
butler.fullscreen.on('change', (element) => {})
await butler.fullscreen.exit()
```

- Browsers only allow it in answer to something the user did. Otherwise `enter()` fails with a `ScreenError`.
- Older browsers have the calls under a prefix; that is handled.
- A phone whose browser cannot fill the screen with any element can still do it with a `<video>`.
  `butler.fullscreen.isSupported` is `false` there, and `canEnter(video)` is `true`: ask about the element you
  have. The video is then shown in the player of the system, without anything the page draws over it.

### Keeping the page from turning

```ts
await butler.fullscreen.enter(preview)
await butler.orientation.lock('landscape')

butler.orientation.unlock()
```

Most browsers only keep a page from turning while it fills the screen, and let it turn again when it stops. A
desktop has the call and rejects it: `lock()` fails with an `UnsupportedError` there, as it does where the call is
missing (`butler.orientation.canLock`). Any other refusal is a `ScreenError`.

## Network

```ts
butler.network.isOnline // false: no network. undefined where there is no browser
butler.network.on('change', (isOnline) => {})

butler.network.connection // { type, effectiveType, downlink, roundTripTime, saveData }, where the browser says
butler.network.on('connectionchange', (connection) => {})
```

A browser knows whether the device is connected to a network, not whether that network reaches the internet: a
phone in a wifi that asks for a login first counts as online. So `isOnline === false` is reliable and a good moment
to queue what should be sent; `true` is a hint, and a request that succeeds is the only proof.

`connection` is `undefined` in the browsers that say nothing about it, and every field of it can be missing in the
others. Use it to choose a smaller upload, never to decide whether something works.

In Vue and React: `useNetwork(butler.network)`. To send something once there is a network, see
[the outbox](files-outbox-page.md#the-outbox).

## Sharing

```ts
const file = new File([photo], 'scan.jpg', { type: photo.type })

if (butler.share.canShare({ files: [file] })) {
  const wasShared = await butler.share.share({ title: 'Scan', files: [file] })
}
```

- `share()` opens the share sheet of the system. It resolves with `false` if the user closed the sheet without
  sharing, which is an answer and not an error.
- A browser that shares links does not have to share files, and one that shares files not every kind of them. Ask
  `canShare()` with exactly what you are going to share; `share()` fails with an `UnsupportedError` for what the
  browser cannot share.
- Browsers only allow it in answer to something the user did. Otherwise it fails with a `PermissionDeniedError`
  whose `permission` is `share`.

## Clipboard

```ts
await butler.clipboard.writeText(link)
const text = await butler.clipboard.readText()

if (butler.clipboard.canWrite('image/png')) {
  await butler.clipboard.write(await session.takePhoto({ source: 'frame', type: 'image/png' }))
}
```

- Every browser that copies data copies PNG pictures; few copy anything else. `canWrite(type)` says.
- Reading asks the user in some browsers and is refused in others: a `PermissionDeniedError` whose `permission` is
  `clipboard`.
- `isSupported` is `false` where the browser gives pages no clipboard, or the page was not loaded over HTTPS.
- `butler.permission.query('clipboard-read')` says whether the page may read, and `request('clipboard-read')`
  reads once so the browser asks.
- To save a file instead of copying it, see [files](files-outbox-page.md#files).

## Errors

| Error                   | Thrown when                                                                   |
| ----------------------- | ----------------------------------------------------------------------------- |
| `UnsupportedError`      | the browser, the device or the page (no HTTPS) does not have what was asked for |
| `PermissionDeniedError` | the browser or the user refused; `permission` is `screen-wake-lock`, `share` or `clipboard` |
| `ScreenError`           | the browser did not fill the screen, return to the page or keep it from turning |
| `SharingError`          | sharing or copying failed for another reason; see `cause`                     |

## Not verified yet

Tested against fakes, and in Chromium, Firefox and WebKit on a desktop, with a click the browser takes for a real
one. No desktop browser has a share sheet a spec could open, and none of them fills the screen with a video only.
How the browsers of real phones behave there, and when they refuse a wake lock, are open questions of the
[device matrix](../device-matrix/README.md).
