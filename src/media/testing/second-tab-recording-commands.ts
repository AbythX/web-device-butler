import type { BrowserCommand } from 'vitest/node'

import { SecondTab } from '../../core/testing/second-tab.ts'

export interface SecondTabKeptRecording {
  namespace: string
  id: string
  /** how long to record before the command returns; the recording goes on */
  milliseconds: number
}

/**
 * Records the microphone in the second tab and keeps the recording in the storage. The recording goes on until the
 * tab is closed, which is what a page that is thrown away looks like to the other tabs.
 *
 * @returns the format the browser writes
 */
export const recordKeptInSecondTab: BrowserCommand<[recording: SecondTabKeptRecording], Promise<string>> = async (
  context,
  recording
) => {
  const page = await SecondTab.inFront(context)

  return page.evaluate(async ({ namespace, id, milliseconds }) => {
    const modulePath = '/src/core/default-device-butler.ts'
    const { DefaultDeviceButler } = await import(/* @vite-ignore */ modulePath)

    const butler = DefaultDeviceButler.create()
    const microphone = await butler.microphone.open()
    const running = await butler.recorder.record(microphone, { keep: { namespace, id }, interval: 100 })
    Reflect.set(globalThis, 'keptRecording', running)

    await new Promise((resolve) => setTimeout(resolve, milliseconds))

    return running.mimeType as string
  }, recording)
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    recordKeptInSecondTab(recording: SecondTabKeptRecording): Promise<string>
  }
}
