import type { BrowserCommand } from 'vitest/node'

import { SecondTab } from '../../core/testing/second-tab.ts'

export interface SecondTabMicrophoneResult {
  isOpen: boolean
  /** the name of the error, if the microphone could not be opened */
  error?: string
  holder?: string
}

/**
 * Opens a microphone session in the second tab and leaves it open.
 */
export const openMicrophoneInSecondTab: BrowserCommand<
  [requirements: Record<string, unknown>],
  Promise<SecondTabMicrophoneResult>
> = async (context, requirements) => {
  const page = await SecondTab.pageOf(context.context, context.page.url())
  // Firefox does not start a device in a tab that is in the background
  await page.bringToFront()

  return page.evaluate(async (options) => {
    const modulePath = '/src/media/microphone/default-microphone-manager.ts'
    const { DefaultMicrophoneManager } = await import(/* @vite-ignore */ modulePath)

    const manager = Reflect.get(globalThis, 'microphoneManager') ?? DefaultMicrophoneManager.create()
    Reflect.set(globalThis, 'microphoneManager', manager)

    try {
      Reflect.set(globalThis, 'microphoneSession', await manager.open(options))

      return { isOpen: true }
    } catch (error) {
      const { name, holder } = error as { name?: string; holder?: string }

      return { isOpen: false, error: name, holder }
    }
  }, requirements)
}

/**
 * Closes the session that {@link openMicrophoneInSecondTab} left open.
 */
export const closeMicrophoneInSecondTab: BrowserCommand<[], Promise<void>> = async (context) => {
  const page = await SecondTab.pageOf(context.context, context.page.url())

  await page.evaluate(async () => {
    await (Reflect.get(globalThis, 'microphoneSession') as { close(): Promise<void> } | undefined)?.close()
  })
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    openMicrophoneInSecondTab(requirements: Record<string, unknown>): Promise<SecondTabMicrophoneResult>
    closeMicrophoneInSecondTab(): Promise<void>
  }
}
