/**
 * The watches a part started and that still run, so the part can end them when it is disposed.
 */
export class WatchRegistry<Watch> {
  private readonly watches = new Set<Watch>()

  /**
   * @param end how a watch is ended: `stop()` or `dispose()`; a watch that ends tells the registry with {@link forget}
   */
  public constructor(private readonly end: (watch: Watch) => void) {}

  /**
   * Remembers the watch until it ends.
   *
   * @returns the watch
   */
  public track<Tracked extends Watch>(watch: Tracked): Tracked {
    this.watches.add(watch)

    return watch
  }

  /**
   * Forgets a watch that ended, by itself or because the application ended it.
   */
  public forget(watch: Watch): void {
    this.watches.delete(watch)
  }

  /**
   * Ends every watch that still runs.
   */
  public endAll(): void {
    // a watch forgets itself while it ends
    for (const watch of [...this.watches]) {
      this.end(watch)
    }
  }
}
