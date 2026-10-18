# Field report

**Goal.** Someone reports from a place where the network comes and goes: a photo and a note. What they send is
never lost. It reaches the server when that is possible, also if the page was closed in between, and a note that is
half written survives a call that pushes the browser to the background.

**Demo.** `pnpm demo`, page `use-cases/field-report/`. Source:
[`demo/use-cases/field-report/main.ts`](../../demo/use-cases/field-report/main.ts). The demo has no server; a store
of the browser stands for it.

## The photo

```ts
takeButton.addEventListener('click', async () => {
  const [photo] = await butler.files.pick({ accept: 'image/*', capture: 'environment' })

  if (photo !== undefined) showPhoto(photo) // nothing: the user closed the camera
})
```

`capture` hands the work to the camera application of the system. For a report that is the better camera: the page
needs no permission, and the photo gets the processing of the device. On a desktop the same call shows the file
dialog. A page that needs a preview of its own, or several photos in a row, opens a session instead; see the
[document scanner](document-scanner.md).

## Keeping the report

An outbox holds what JSON can write. The photo goes into a store, and its key into the outbox:

```ts
const photos = await butler.storage.open({
  driver: ['opfs', 'indexeddb', 'memory'],
  namespace: 'report-photos',
  codec: new BinaryCodec(),
})

const key = crypto.randomUUID()
await photos.set(key, new Uint8Array(await photo.arrayBuffer()))
await reports.add({ photo: key, name: photo.name, type: photo.type, note, takenAt: photo.lastModified })
```

The photo is written first, so a report in the outbox always has one. `add()` resolves once the report is kept;
from then on the user can be told that it is safe, whether or not there is a network.

## Sending

```ts
const reports = await butler.outbox.open<Report>({
  namespace: 'reports',
  send: async (report, { id, signal }) => {
    const bytes = await photos.get(report.photo)
    if (bytes === undefined) throw new Error('The photo of this report is gone')

    const body = new FormData()
    body.set('note', report.note)
    body.set('photo', new File([bytes as Uint8Array<ArrayBuffer>], report.name, { type: report.type }))

    const response = await fetch('/api/reports', { method: 'POST', headers: { 'Idempotency-Key': id }, body, signal })

    if (!response.ok) throw new Error(`The server answered ${response.status}`)
  },
})
```

- Open the outbox when the application starts, not when the user sends: opening it sends what the last visit left.
- `send` rejects, and the report stays and is tried again: after a while, when the network returns, or with
  `reports.flush()` behind a button. Without a network nothing is tried at all.
- A report can arrive twice, if the page dies between the delivery and noting it down. The server recognises the
  `id`.

The photo is removed once its report has left:

```ts
reports.on('sent', ({ item }) => photos.delete(item.photo))
```

A page that dies between the delivery and this line leaves a photo without a report. Compare the keys of the store
with `reports.entries()` when the application starts, if that matters.

## Telling the user

```ts
const show = () => (notice.hidden = butler.network.isOnline !== false)

butler.network.on('change', show)
show()
```

`isOnline === false` is reliable and worth a notice: "kept, sent once there is a network". `true` only says that
the device is connected to something, so it is no reason to promise anything; what was sent is what `sent`
reports.

```ts
for (const { item, attempts, lastError } of await reports.entries()) {
  // the list of what waits, with how often it was tried and what the last try said
}
```

A report that waited for a network is sent while the user does something else. Tell them once it arrived, unless
they look at the application anyway:

```ts
sendButton.onclick = () => butler.permission.request('notifications') // the browsers ask only in a click

reports.on('sent', ({ item }) =>
  butler.notifications.show({ title: 'Report sent', body: item.note, tag: 'field-report', when: 'unseen' })
)
```

- `when: 'unseen'` shows it only while no tab of the application can be seen: the tabs ask each other.
- One `tag` for every report: the second notification replaces the first, and does not pile up.
- Where notifications cannot be shown, `butler.vibration.vibrate('success')` is a small sign on a phone, and
  nothing elsewhere.

## The note that is half written

On a phone a page in the background is thrown away without another word, so the note is kept when the page is
hidden, not when it is left:

```ts
butler.page.on('change', (state) => {
  if (state !== 'visible') void drafts.set('note', textarea.value)
})

textarea.value = (await drafts.get('note')) ?? ''
```

The photo of a report that is not sent yet can be kept the same way, in the store of the photos.

## Giving the photo away

A report that waits can leave the device another way in the meantime:

```ts
shareButton.hidden = !butler.share.canShare({ files: [photo] })
shareButton.onclick = () => butler.share.share({ text: report.note, files: [photo] })

saveButton.onclick = () => butler.files.save(photo, { name: report.name }) // 'saved' | 'downloaded' | 'cancelled'
```

## Several tabs

Only one tab sends, and it also takes what the other tabs added, so two open tabs do not deliver a report twice.
`sent` and `failed` are announced in the tab that sent; a tab that shows the list reads `reports.entries()` again
when it becomes visible.

## Variations

- **Giving up**: `maxAttempts: 10` removes a report the server keeps refusing; `failed` says `willRetry: false`, and
  the reports after it go on. Remove its photo there as well.
- **Insisting on a backend that survives the page**: `storage: { require: { persistence: 'origin' } }` fails with a
  `StorageUnsupportedError` in a browser that only has the memory of the page, instead of keeping reports that a
  reload loses.
- **A recording instead of a photo**: record into a stream of the store, as the [voice memos](voice-memo.md) do,
  and put its key into the outbox.
