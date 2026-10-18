import type { Watch } from './watch.ts'

/**
 * The watches a part started and that still run, so the part can stop them when it is disposed. A watch that stops
 * tells the registry with {@link forget}.
 */
export class WatchRegistry<Tracked extends Pick<Watch<unknown>, 'stop'>> {
  private readonly watches = new Set<Tracked>()

  /**
   * Remembers the watch until it ends.
   *
   * @returns the watch
   */
  public track<Started extends Tracked>(watch: Started): Started {
    this.watches.add(watch)

    return watch
  }

  /**
   * Forgets a watch that ended, by itself or because the application ended it.
   */
  public forget(watch: Tracked): void {
    this.watches.delete(watch)
  }

  /**
   * Stops every watch that still runs.
   */
  public endAll(): void {
    // a watch forgets itself while it ends
    for (const watch of [...this.watches]) {
      watch.stop()
    }
  }
}
