import type { BrowserCommand } from 'vitest/node'

import { SecondTab } from '../../core/testing/second-tab.ts'

export interface SecondTabEntry {
  driver: string
  namespace: string
  key: string
}

type SecondTabCommand<Argument, Result = void> = BrowserCommand<[argument: Argument], Promise<Result>>

/**
 * Increments a number in the second tab, `times` times and overlapping.
 */
export const incrementInSecondTab: SecondTabCommand<SecondTabEntry & { times: number }> = async (context, entry) => {
  const page = await SecondTab.of(context)

  await page.evaluate(async ({ driver, namespace, key, times }) => {
    const modulePath = '/src/storage/index.ts'
    const { DefaultStorageManager } = await import(/* @vite-ignore */ modulePath)
    const manager = DefaultStorageManager.create()
    const store = await manager.open({ driver, namespace })

    await Promise.all(
      Array.from({ length: times }, () =>
        store.update(key, async (current: number | undefined) => {
          await new Promise((resolve) => setTimeout(resolve, 1))

          return (current ?? 0) + 1
        })
      )
    )
    manager.dispose()
  }, entry)
}

/**
 * Sets a value in the second tab.
 */
export const setInSecondTab: SecondTabCommand<SecondTabEntry & { value: unknown }> = async (context, entry) => {
  const page = await SecondTab.of(context)

  await page.evaluate(async ({ driver, namespace, key, value }) => {
    const modulePath = '/src/storage/index.ts'
    const { DefaultStorageManager } = await import(/* @vite-ignore */ modulePath)
    const manager = DefaultStorageManager.create()

    await (await manager.open({ driver, namespace })).set(key, value)
    manager.dispose()
  }, entry)
}

/**
 * Starts writing an entry as a stream in the second tab and leaves the stream open.
 */
export const openWriteStreamInSecondTab: SecondTabCommand<SecondTabEntry & { text: string }> = async (
  context,
  entry
) => {
  const page = await SecondTab.of(context)

  await page.evaluate(async ({ driver, namespace, key, text }) => {
    const modulePath = '/src/storage/index.ts'
    const { DefaultStorageManager, BinaryCodec } = await import(/* @vite-ignore */ modulePath)
    const store = await DefaultStorageManager.create().open({ driver, namespace, codec: new BinaryCodec() })

    const writer = (await store.writeStream(key)).getWriter()
    await writer.write(new TextEncoder().encode(text))
    Reflect.set(globalThis, 'openWriter', writer)
  }, entry)
}

/**
 * Closes the stream that {@link openWriteStreamInSecondTab} left open.
 */
export const closeWriteStreamInSecondTab: BrowserCommand<[], Promise<void>> = async (context) => {
  const page = await SecondTab.of(context)

  await page.evaluate(async () => {
    await (Reflect.get(globalThis, 'openWriter') as WritableStreamDefaultWriter).close()
  })
}

/**
 * Closes the second tab, as a user would, without giving its page a chance to clean up.
 */
export const closeSecondTab: BrowserCommand<[], Promise<void>> = async (context) => {
  await SecondTab.close(context)
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    incrementInSecondTab(entry: SecondTabEntry & { times: number }): Promise<void>
    setInSecondTab(entry: SecondTabEntry & { value: unknown }): Promise<void>
    openWriteStreamInSecondTab(entry: SecondTabEntry & { text: string }): Promise<void>
    closeWriteStreamInSecondTab(): Promise<void>
    closeSecondTab(): Promise<void>
  }
}
