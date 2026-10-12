import type { BrowserCommand } from 'vitest/node'

import { SecondTab } from '../../core/testing/second-tab.ts'

export interface SecondTabCameraOptions {
  whenBusy: 'fail' | 'wait' | 'takeover'
  /** whether the session of the second tab gives the camera up when asked */
  allowTakeover?: boolean
}

export interface SecondTabCameraResult {
  isOpen: boolean
  /** the name of the error, if the camera could not be opened */
  error?: string
  holder?: string
}

export interface SecondTabCameraState {
  state: string | undefined
  /** why the session of the second tab ended */
  endReason: string | undefined
}

/**
 * Opens a camera session in the second tab and leaves it open.
 */
export const openCameraInSecondTab: BrowserCommand<
  [options: SecondTabCameraOptions],
  Promise<SecondTabCameraResult>
> = async (context, options) => {
  const page = await SecondTab.pageOf(context.context, context.page.url())
  // Firefox does not start a camera in a tab that is in the background, it waits until the tab is looked at
  await page.bringToFront()

  return page.evaluate(async ({ whenBusy, allowTakeover = true }) => {
    const modulePath = '/src/media/testing/input/test-input-manager.ts'
    const { TestInputManager } = await import(/* @vite-ignore */ modulePath)

    const manager = Reflect.get(globalThis, 'cameraManager') ?? TestInputManager.inBrowser()
    Reflect.set(globalThis, 'cameraManager', manager)

    try {
      const session = await manager.open({ whenBusy })
      session.allowTakeover = allowTakeover
      session.on('ended', (end: { reason: string }) => Reflect.set(globalThis, 'cameraEndReason', end.reason))

      Reflect.set(globalThis, 'cameraSession', session)

      return { isOpen: true }
    } catch (error) {
      const { name, holder } = error as { name?: string; holder?: string }

      return { isOpen: false, error: name, holder }
    }
  }, options)
}

/**
 * What became of the session that {@link openCameraInSecondTab} left open.
 */
export const cameraInSecondTab: BrowserCommand<[], Promise<SecondTabCameraState>> = async (context) => {
  const page = await SecondTab.pageOf(context.context, context.page.url())

  return page.evaluate(() => ({
    state: (Reflect.get(globalThis, 'cameraSession') as { state: string } | undefined)?.state,
    endReason: Reflect.get(globalThis, 'cameraEndReason') as string | undefined,
  }))
}

/**
 * Closes the session that {@link openCameraInSecondTab} left open, the way an application does.
 */
export const closeCameraInSecondTab: BrowserCommand<[], Promise<void>> = async (context) => {
  const page = await SecondTab.pageOf(context.context, context.page.url())

  await page.evaluate(async () => {
    await (Reflect.get(globalThis, 'cameraSession') as { close(): Promise<void> } | undefined)?.close()
  })
}

export interface SecondTabCameraPreparation {
  permission: string
  /** the id of the camera `open()` would start */
  selected?: string
  /** how many cameras the second tab knows with what they can do */
  probed: number
  /** the name of the error, if no camera was selected */
  error?: string
}

/**
 * Loads the application in the second tab, as far as the camera is concerned: a new camera manager that prepares.
 */
export const prepareCameraInSecondTab: BrowserCommand<
  [requirements: Record<string, unknown>],
  Promise<SecondTabCameraPreparation>
> = async (context, requirements) => {
  const page = await SecondTab.pageOf(context.context, context.page.url())

  return page.evaluate(async (configuration) => {
    const modulePath = '/src/media/camera/default-camera-manager.ts'
    const { DefaultCameraManager } = await import(/* @vite-ignore */ modulePath)

    const manager = DefaultCameraManager.create(configuration)

    try {
      const result = await manager.prepare()

      return {
        permission: result.permission,
        selected: result.selected?.id,
        probed: result.cameras.filter((camera: { detail: string }) => camera.detail === 'probed').length,
        error: result.error?.name,
      }
    } finally {
      manager.dispose()
    }
  }, requirements)
}

/**
 * Makes the tab that runs the spec the one the user looks at again.
 */
export const showFirstTab: BrowserCommand<[], Promise<void>> = async (context) => {
  await context.page.bringToFront()
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    openCameraInSecondTab(options: SecondTabCameraOptions): Promise<SecondTabCameraResult>
    cameraInSecondTab(): Promise<SecondTabCameraState>
    closeCameraInSecondTab(): Promise<void>
    prepareCameraInSecondTab(requirements: Record<string, unknown>): Promise<SecondTabCameraPreparation>
    showFirstTab(): Promise<void>
  }
}
