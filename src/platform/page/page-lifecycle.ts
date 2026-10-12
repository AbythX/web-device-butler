import type { Listenable } from '../../core/events/listenable.ts'

/**
 * - `visible`: the user can see the page
 * - `hidden`: the page is in the background: another tab or application is in front, or the screen is locked
 * - `frozen`: the browser stopped running the page to save energy; nothing of the page runs until it resumes
 */
export type PageState = 'visible' | 'hidden' | 'frozen'

export interface PageLeave {
  /** whether the browser keeps the page as it is, to return to it when the user goes back */
  readonly isKept: boolean
}

export interface PageLifecycleEvents {
  /** the page went to the background, was frozen, or came back */
  change: PageState
  /** the page is being left: closed, reloaded or navigated away from */
  leave: PageLeave
}

/**
 * What happens to the page as a whole (`butler.page`): whether the user can see it, and when it is about to go.
 *
 * On a phone a page mostly does not get closed: it goes to the background and is thrown away later, without another
 * word. So `change` to `hidden` is the last moment a page can count on, and the one to save what must not be lost.
 * `leave` comes on top where the browser still says goodbye; what is started there may not be finished.
 */
export interface PageLifecycle extends Listenable<PageLifecycleEvents>, Disposable {
  /**
   * `undefined` where there is no page, as during server-side rendering. `frozen` is only known while someone
   * listens to `change`.
   */
  readonly state: PageState | undefined

  /**
   * Whether the user can see the page. `false` where there is none.
   */
  readonly isVisible: boolean

  /**
   * Resolves once the user can see the page, which is at once if they can already, and where there is no page.
   */
  whenVisible(): Promise<void>

  /**
   * Stops watching and forgets every listener.
   */
  dispose(): void
}
