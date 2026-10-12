# Files, the outbox, the page

What an application needs once it has captured something: put it where the user finds it, send it when that is
possible, and not lose it when the page goes away.

Try it: `pnpm demo`, pages `sharing/` for the files, `network/` for the outbox and `screen/` for the page. The
[field report](../use-cases/field-report.md) uses all three together.

## Files

```ts
button.addEventListener('click', async () => {
  const outcome = await butler.files.save(photo, { name: 'scan.jpg', description: 'Photo' })
  // 'saved' | 'downloaded' | 'cancelled'
})
```

- Where the browser has a save dialog, the user chooses the place and the file is written there: `saved`.
  Everywhere else, and where the dialog cannot be shown, the browser gets the file as a download and puts it where
  its downloads go: `downloaded`. `butler.files.canChooseWhereToSave` says which it will be.
- `cancelled` means the user closed the dialog. It is an answer, not an error.
- A file that could not be written is a `FileError`.

To take a file from the device:

```ts
const [photo] = await butler.files.pick({ accept: 'image/*' })
const documents = await butler.files.pick({ accept: ['.pdf', 'image/*'], multiple: true })

// a new picture, taken with the camera application of the system
const [taken] = await butler.files.pick({ accept: 'image/*', capture: 'environment' })
```

- The result is empty if the user closed the dialog.
- `capture` is the way to a picture where a page gets no camera of its own, and where the photo of the camera
  application is wanted: it applies the processing of the device, which a stream does not get. A desktop ignores it
  and shows the file dialog.
- Older browsers do not say when the user closes the dialog. There the call only ends through its `signal`; pass
  one that aborts when the user leaves the screen.

Both calls have to answer something the user did, such as a click.

## The outbox

An outbox keeps what should be sent until it could be sent: what a user did without a network is not lost, also
not when the page is closed in between.

```ts
const uploads = await butler.outbox.open<{ scan: string; takenAt: number }>({
  namespace: 'uploads',
  send: async (item, { id, signal }) => {
    const response = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'Idempotency-Key': id },
      body: JSON.stringify(item),
      signal,
    })

    if (!response.ok) throw new Error(`The server answered ${response.status}`)
  },
})

await uploads.add({ scan: scanId, takenAt: Date.now() })
```

- **In order, one at a time.** Items are sent in the order they were added, and only by one tab at a time. A tab
  that sends also takes what another tab added.
- **A failure keeps the item and the order.** `send` rejects, the item stays, and nothing after it is sent. It is
  tried again after a while (5 seconds, doubled with every failure, 5 minutes at most; `retryDelay` changes that),
  when the network returns, and with `uploads.flush()`.
- **Without a network nothing is tried.** `butler.network` decides; where a browser does not say, the outbox tries.
- **What was left is sent next time.** Opening an outbox starts sending what the last visit left in it.
- **An item can arrive twice**, if the page dies between the delivery and noting it down. Hand the `id` to the
  server so it can tell.

```ts
uploads.on('sent', (entry) => {})
uploads.on('failed', ({ entry, error, willRetry }) => {})

await uploads.entries() // what waits, with `attempts` and `lastError`
await uploads.remove(id)
```

- `maxAttempts` gives an item up after that many tries: it is removed, and `failed` says `willRetry: false`. The
  items after it go on. Without it an item is never given up.
- An item has to be something JSON can write. Keep a photo or a recording in a
  [store](storage.md) and put its key into the outbox; `send` reads it from there.
- The items are kept in a backend that survives the page and is consistent across tabs, where the browser has one.
  `storage: { require: { persistence: 'origin' } }` insists on it and fails with a `StorageUnsupportedError`
  otherwise.

## The page

```ts
butler.page.state // 'visible' | 'hidden' | 'frozen'; undefined where there is no page
butler.page.isVisible
await butler.page.whenVisible()

butler.page.on('change', (state) => {
  if (state !== 'visible') saveWhatMustNotBeLost()
})
butler.page.on('leave', ({ isKept }) => {})
```

On a phone a page mostly does not get closed. It goes to the background and is thrown away later, without another
word. So **`change` to `hidden` is the last moment a page can count on**: save there, not when the page is left.

- `frozen` means the browser stopped running the page to save energy. It is only known while someone listens to
  `change`.
- `leave` is announced where the browser still says goodbye: the page is closed, reloaded or navigated away from.
  What is started there may not be finished. `isKept` says whether the browser keeps the page as it is, to return
  to it when the user goes back.
- A [recording](recording.md#how-it-ends) uses both: it has the browser hand over its data when the page is hidden,
  and ends when the page is left.

## Errors

| Error                     | Thrown when                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `UnsupportedError`        | there is no page to show a dialog or start a download from     |
| `FileError`               | the file could not be written where the user chose             |
| `StorageUnsupportedError` | no backend has what the `storage` of an outbox requires        |

## Not verified yet

Tested against fakes, and in Chromium, Firefox and WebKit as far as a spec can go: a dialog of the browser cannot
be answered by one. Saving through the save dialog, choosing files and `capture` on a phone have not been run by
hand; see the [device matrix](../device-matrix/README.md).
