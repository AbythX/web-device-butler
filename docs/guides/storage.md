# Storage

A browser has five places to keep data, each with its own API, its own limits and its own idea of what happens when
two tabs write at once. `butler.storage` puts one interface over them: a `Store` behaves the same on every backend,
and says what its backend can do.

Try it: `pnpm demo`, page `storage/`.

## Opening a store

```ts
interface Settings {
  theme: 'light' | 'dark'
}

const settings = await butler.storage.open<Settings>({
  driver: ['indexeddb', 'local'],
  namespace: 'settings',
})
```

- `driver` is a name or a list of names. The first driver of the list that works in this browser is used; if none
  does, the call rejects with a `StorageUnsupportedError`.
- Without `driver` the library chooses the backend itself. See [Letting the library choose](#letting-the-library-choose).
- `namespace` separates stores. Entries of different namespaces never see each other, even on the same driver. The
  `storage.namespace` of the configuration is a prefix in front of all of them, so several applications on one origin
  stay apart.
- Opening the same namespace again gives a second object on the same data.

## Choosing a driver

| Driver      | Lives                        | Holds                      | Streams | Other tabs see changes | Use it for                               |
| ----------- | ---------------------------- | -------------------------- | ------- | ---------------------- | ---------------------------------------- |
| `indexeddb` | with the origin              | values and bytes           | no      | yes                    | the default: settings, lists, small files |
| `opfs`      | with the origin              | values and bytes, as files | yes     | yes                    | large data: recordings, photos           |
| `local`     | with the origin              | strings, a few megabytes   | no      | yes, values can lag    | the fallback of `indexeddb`              |
| `session`   | until the tab is closed      | strings, a few megabytes   | no      | no                     | state of one tab that survives a reload  |
| `memory`    | until the page is left       | values and bytes           | yes     | no                     | the last entry of a chain, and tests     |

What a store ended up with is in `store.capabilities`:

```ts
settings.capabilities.driver // which entry of the chain was chosen
settings.capabilities.persistence // 'origin' | 'tab' | 'page'
settings.capabilities.binary // stores bytes as they are, without base64
settings.capabilities.streaming
settings.capabilities.crossTabEvents
settings.capabilities.consistentAcrossTabs
```

Two things to check where they matter:

- **`persistence`**. A chain that ends in `memory` always opens, but then the data is gone after a reload. Tell the
  user, or leave `memory` out and handle the `StorageUnsupportedError`.
- **`consistentAcrossTabs`**. It is `false` for `local`: Firefox and Safari pass a write on to the other tabs with a
  delay, so `update()` and `lock()` can, rarely, work on a value that another tab has just replaced. Data that
  several tabs update at once belongs in `indexeddb` or `opfs`.

`butler.storage.isSupported('opfs')` answers for one driver without opening a store. An application adds a backend
of its own by extending `StorageDriver` and calling `butler.storage.register(driver)`.

The code of `opfs` and `indexeddb` is loaded when a store first asks for one of them, so an application that uses
neither does not carry it.

`opfs` keeps every entry as a file whose name is made of the key. Everything but lowercase letters, digits, `-` and
`_` takes three characters there, and a file name has room for 255: a key that does not fit is refused with a
`StorageError` that says so. Keep the keys of an `opfs` store short and lowercase, or use `indexeddb`.

## Letting the library choose

Instead of naming a backend, say what the store needs. `require` is what the backend must have: one without it is
never used. `prefer` is what it should have: among the backends that have what is required and work in this
browser, the one with the most of it is taken.

```ts
const recordings = await butler.storage.open({
  namespace: 'recordings',
  require: { persistence: 'origin', binary: true },
  prefer: { streaming: true },
})

recordings.capabilities.driver // 'opfs' where the browser has it, 'indexeddb' otherwise
```

| Trait                  | In `require`                                                                  | In `prefer`                  |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------------- |
| `persistence`          | `'origin'`, `'tab'` or `'page'`, exactly: `'tab'` does not take a backend that outlives the tab | backends with it rank higher |
| `binary`, `streaming`, `crossTabEvents`, `consistentAcrossTabs` | the backend has it. `false` asks for nothing. | backends with it rank higher |
| `persistent`           | the browser has promised not to evict the data of the origin. Refused, the store does not open. | the promise is asked for; the store opens either way |

The traits are the [capabilities](#choosing-a-driver) every backend declares, so a backend of your own takes part
like the others. `persistent` belongs to the origin and not to a backend: it is what `butler.storage.persist()`
asks for, requested when the store is opened, which shows a prompt in some browsers.

`driver` and the traits combine. A list limits the backends to choose from, and its order decides between those
that rank the same:

| Written                                                          | Chosen                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| `driver: 'opfs'`                                                 | this backend or an error                             |
| `driver: ['indexeddb', 'local']`                                 | the first that works here                            |
| `require: { persistence: 'origin' }, prefer: { streaming: true }` | among every registered backend                      |
| `driver: ['opfs', 'indexeddb'], require: { binary: true }`       | among the named ones, and only one that fits         |
| nothing                                                          | the default order                                    |

Without a list, backends that rank the same are taken in the default order: the one whose data lives longest first
(`origin`, `tab`, `page`), then `indexeddb`, `opfs`, `local`, `session`, `memory`, then your own backends in the
order they were registered.

If nothing fits, `open()` rejects with a `StorageUnsupportedError` whose message says what each backend lacks.

The `storage` section of the configuration takes the same three fields as the defaults of every `open()`. A field
of a call replaces the configured field as a whole.

```ts
const butler = DefaultDeviceButler.create({
  storage: { namespace: 'my-app', require: { persistence: 'origin' }, prefer: { persistent: true } },
})
```

Three things to know before leaving the choice to the library:

- **The backend can be another one on the next visit.** The data of a store lives in its backend. If a browser
  gains or loses a backend, you register one, or the default order changes with a version of the library, the same
  `open()` lands elsewhere and finds the store empty. The library does not move data between backends. For data
  that has to be found again, name one backend, or a short list.
- **Without a required lifetime the choice can end in `session` or `memory`**, where a browser blocks the others,
  for example in private mode. What is preferred counts before the lifetime, so `prefer: { streaming: true }` alone
  takes `memory` in a browser without `opfs`. The data is then gone with the tab or the page. `require: { persistence: 'origin' }`
  rules that out.
- **Only the code of the chosen backend is loaded.** What `opfs` and `indexeddb` can do is known without loading
  them.

`butler.storage.prepare()` does the choosing without opening a store: it resolves with the `capabilities` of the
backend `open()` would use, whether the data `isPersistent`, or the `error`. It does not throw.

## Entries

```ts
await settings.set('user', { theme: 'dark' })
await settings.get('user') // undefined where there is no entry
await settings.has('user')
await settings.delete('user') // resolves with whether there was an entry

for await (const key of settings.keys()) {
}
for await (const [key, value] of settings.entries()) {
}
// both leave out an entry the store cannot read (not written by the library, or in a newer format) and report it
// to the logger; get() and has() of such a key say why

await settings.size() // the bytes the store occupies
await settings.clear() // every entry of this namespace, and nothing else
```

`set()` replaces the entry in one step: a reader, in this tab or another, sees the old value or the new one, never
half of each.

### Expiry

```ts
await cache.set('token', token, { ttl: 60_000 })
```

After `ttl` milliseconds the entry counts as missing. Expiry is enforced on read; there is no timer.

### Building on the current value

Two tabs that read a value, change it and write it back overwrite each other. `update()` reads, applies the
function and writes as one step across all tabs:

```ts
const visits = await counters.update('visits', (count = 0) => count + 1)
```

For more than one step, `lock()` keeps everyone else from writing the entry while a task runs:

```ts
await drafts.lock('letter', async (entry) => {
  const draft = await entry.get()
  const merged = await mergeWithServer(draft)
  await entry.set(merged)
})
```

The task reads and writes through the object it receives. The lock is not reentrant: calling `set`, `delete`,
`update` or `lock` of the store for the same key inside the task waits for the task itself and never returns.

Every write waits while the entry is in use. `{ wait: false }` fails with a `StorageLockedError` instead, and
`{ signal }` stops waiting.

### Changes

```ts
settings.on('change', ({ type, key, origin }) => {
  // type: 'set' | 'delete'
  // origin: 'local' (this tab, this store or another one on the same data) | 'remote' (another tab)
})
```

One listener covers every source, so a screen that renders from the store and re-renders on `change` is correct in
every tab. See [settings in several tabs](../use-cases/settings-across-tabs.md).

## Codecs

A codec turns values into what a backend holds. The default is JSON.

```ts
import { BinaryCodec, JsonCodec, TextCodec } from 'web-device-butler'

// bytes, for example pictures; base64 is used only where the backend holds nothing but strings
const pictures = await butler.storage.open({ driver: 'opfs', namespace: 'pictures', codec: new BinaryCodec() })

// JSON that is validated when it is read, here with zod
const settings = await butler.storage.open({
  driver: 'indexeddb',
  namespace: 'settings',
  codec: new JsonCodec({ parse: (value) => SettingsSchema.parse(value) }),
})
```

Validating on read is worth it for data that outlives a release: what an older version of the application wrote
arrives as a `StorageCodecError` instead of as an object of the wrong shape somewhere else. A format of your own implements
`Codec<T>` with `encode()` and `decode()`.

## Streams

For values that should not be held in memory, such as a recording. Only where `capabilities.streaming` is `true`
(`opfs`, `memory`); elsewhere the calls reject with a `StorageUnsupportedError`.

```ts
const writer = (await recordings.writeStream('take-1')).getWriter()
try {
  for await (const chunk of chunks) {
    await writer.write(chunk) // Uint8Array
  }
  await writer.close() // now the entry is replaced, in one step
} catch (error) {
  await writer.abort(error) // the entry stays as it was
  throw error
}

const stream = await recordings.readStream('take-1') // undefined where there is no entry
const blob = await new Response(stream).blob()
```

- Until the stream is closed, nobody else, in this tab or another, can write or delete the entry.
- A stream has to be closed or aborted. An abandoned one keeps the entry locked until the tab is closed.
- Open the store with a `BinaryCodec` to read the same entry with `get()` as well. `get()` copies the bytes into a
  buffer of their own, so use the stream for what is too large for that.

See [voice memos](../use-cases/voice-memo.md).

## Space

```ts
const space = await butler.storage.space()

space.isKnown // false where the browser gives no estimate
space.quota // bytes the origin may use
space.usage
space.available
space.usedRatio // 0..1
space.isPersistent
space.hasRoomFor(bytes) // false when the space is unknown

await butler.storage.persist() // asks the browser not to evict; resolves with whether it agreed
```

The numbers are estimates for the whole origin and can be wrong in both directions: a write still has to handle
`StorageQuotaExceededError`. `local` and `session` have their own fixed limit that is not part of them.

To follow the space, for the duration of a recording or on a settings screen:

```ts
using watch = butler.storage.watchSpace({ interval: 5000, lowBelow: 50 * 1024 * 1024 })

watch.on('change', (space) => {})
watch.on('low', (space) => stopRecording())

watch.current // the last read; undefined until the first finished
watch.isActive
watch.stop()
```

## Errors

All extend `StorageError`. See [Errors](errors.md#storage).
