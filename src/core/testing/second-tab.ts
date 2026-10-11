import type { BrowserContext, Page } from 'playwright'

/**
 * A real second tab for the browser specs: another page in the same browser context, so it shares the origin with
 * the page that runs the spec. The commands of the specs run on the test server and drive that page; a spec calls them
 * through `commands` of `vitest/browser`.
 */
export class SecondTab {
  private static readonly pages = new WeakMap<BrowserContext, Promise<Page>>()
  /** how long one step of opening the tab may take, in milliseconds */
  private static readonly stepTimeout = 5000
  private static readonly attempts = 3
  /**
   * The test server rewrites every `import()` of the library to go through a function of the page that runs the
   * specs. The second tab is not such a page, so it brings the function itself, the way vitest does for workers.
   */
  private static readonly document =
    '<!doctype html><title>second tab</title>' +
    '<script>globalThis.__vitest_browser_runner__ = { wrapDynamicImport: (load) => load() }</script>'

  public static pageOf(context: BrowserContext, firstTabUrl: string): Promise<Page> {
    let page = SecondTab.pages.get(context)

    if (page === undefined) {
      page = SecondTab.open(context, firstTabUrl)
      SecondTab.pages.set(context, page)
      // a tab that could not be opened is opened again by the next command
      page.catch(() => SecondTab.pages.delete(context))
    }

    return page
  }

  public static async close(context: BrowserContext): Promise<void> {
    const page = SecondTab.pages.get(context)
    SecondTab.pages.delete(context)
    await (await page?.catch(() => undefined))?.close()
  }

  /**
   * Now and then a browser does not finish opening the page, mostly while the machine is busy with the other
   * browsers of the test run. A step that takes too long is therefore given up and the tab is opened again.
   */
  private static async open(context: BrowserContext, firstTabUrl: string): Promise<Page> {
    const url = new URL('/second-tab.html', firstTabUrl).href
    let failure: unknown

    for (let attempt = 0; attempt < SecondTab.attempts; attempt++) {
      let page: Page | undefined

      try {
        page = await SecondTab.within('open a page', context.newPage())

        // an empty document on the origin of the test server, which also serves the modules of the library
        await page.route(url, (route) => route.fulfill({ contentType: 'text/html', body: SecondTab.document }))
        await page.goto(url, { timeout: SecondTab.stepTimeout })

        return page
      } catch (error) {
        failure = error
        await page?.close().catch(() => undefined)
      }
    }

    throw failure
  }

  private static within<Result>(step: string, work: Promise<Result>): Promise<Result> {
    let timer: ReturnType<typeof setTimeout> | undefined

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`The second tab could not ${step} within ${SecondTab.stepTimeout} ms`)),
        SecondTab.stepTimeout
      )
    })

    return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
  }
}
