import type { BrowserCommand } from 'vitest/node'

import { SecondTab } from '../../core/testing/second-tab.ts'

/**
 * Brings the second tab to the front, where the user can see it, and lets its butler answer the other tabs about
 * that, as the tab of an application that uses its notifications.
 *
 * @returns whether the second tab can be seen
 */
export const answerNotificationsInSecondTab: BrowserCommand<[], Promise<boolean>> = async (context) => {
  const page = await SecondTab.inFront(context)

  return page.evaluate(async () => {
    const modulePath = '/src/core/default-device-butler.ts'
    const { DefaultDeviceButler } = await import(/* @vite-ignore */ modulePath)

    const butler = Reflect.get(globalThis, 'notifyingButler') ?? DefaultDeviceButler.create()
    Reflect.set(globalThis, 'notifyingButler', butler)
    // the first use makes the tab answer
    void butler.notifications.isSupported

    return document.visibilityState === 'visible'
  })
}

/**
 * Whether the user can see the second tab, as its page says.
 */
export const isSecondTabVisible: BrowserCommand<[], Promise<boolean>> = async (context) => {
  const page = await SecondTab.of(context)

  return page.evaluate(() => document.visibilityState === 'visible')
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    answerNotificationsInSecondTab(): Promise<boolean>
    isSecondTabVisible(): Promise<boolean>
  }
}
