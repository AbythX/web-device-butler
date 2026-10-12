# Settings in several tabs

**Goal.** The settings of an application are the same in every tab: a change in one tab shows in the others without
a reload, and two tabs that change something at the same time do not undo each other.

**Demo.** `pnpm demo`, page `use-cases/shared-settings/`. Open it in two tabs. Source:
[`demo/use-cases/shared-settings/main.ts`](../../demo/use-cases/shared-settings/main.ts).

## The store

```ts
interface Settings {
  theme: 'system' | 'light' | 'dark'
  name: string
}
const defaults: Settings = { theme: 'system', name: '' }

const settings = await butler.storage.open<Settings>({ driver: ['indexeddb', 'local'], namespace: 'settings' })
```

`indexeddb` first: tabs read what another tab wrote as soon as the write has returned. `localStorage` passes writes
on with a delay in Firefox and Safari (`settings.capabilities.consistentAcrossTabs` is `false` for it), which is
good enough as a fallback for settings and not for counters.

## Showing

```ts
const show = async () => applySettings((await settings.get('user')) ?? defaults)

settings.on('change', () => void show())
await show()
```

One listener serves every source: this screen, another component on the same page, another tab. The screen never
shows what it thinks it wrote, only what is stored.

## Changing one setting

The obvious way loses data:

```ts
// do not do this
const current = (await settings.get('user')) ?? defaults
await settings.set('user', { ...current, theme: 'dark' })
```

Between the `get` and the `set` another tab can write a new name, and this tab writes the old one back. `update()`
reads, changes and writes as one step across all tabs:

```ts
await settings.update('user', (current = defaults) => ({ ...current, theme: 'dark' }))
```

The same for anything that counts:

```ts
await counters.update('visits', (count = 0) => count + 1)
```

In the demo, two tabs that count 100 clicks each at the same moment end at 200. The storage demo has the
counter-example next to it: `get()` and `set()` in a loop ends below 200.

## Alternatives

- **One entry per setting** (`settings.set('theme', 'dark')`) avoids the question: tabs that change different
  settings write different entries. It fits flat settings; one object with `update()` fits settings that are read
  and validated together.
- **Validating on read** protects against what an older version of the application stored:

  ```ts
  codec: new JsonCodec({ parse: (value) => SettingsSchema.parse(value) })
  ```

  A stored value that does not fit arrives as a `StorageCodecError`; treat it as "no settings yet".

## With Vue

`useStoredValue` is the pattern above as a composable:

```ts
import { useStoredValue } from 'web-device-butler/vue'

const { value, isLoaded, error, update } = useStoredValue(settings, 'user')

// in the template: value?.theme
const setTheme = (theme: Settings['theme']) => update((current = defaults) => ({ ...current, theme }))
```

`value` follows every change of the entry, also the ones of other components and other tabs. Failures end up in
`error` instead of being thrown.

## What it does not do

There is no merging of concurrent edits of the same field: the last write wins. For settings that is what users
expect. Text that two tabs edit at once needs more than a store.
